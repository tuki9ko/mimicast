/**
 * DynamoDB(Videos) へのアクセス。
 *
 * 一覧は必ず GSI1 の Query で取得する（Scan は使用しない）。
 * 状態遷移には条件式を付け、削除処理との競合で状態が巻き戻らないようにする。
 */

import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

import { VIDEO_GSI1PK, type DistributionStatus } from "@mimicast/shared";

import type { VideoRecord } from "../domain/video.ts";
import { conflict, notFound } from "../http/errors.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";

export interface ListParams {
  limit: number;
  cursor?: string;
}

export interface ListResult {
  items: VideoRecord[];
  nextCursor: string | null;
}

export interface ReadyOutput {
  outputKey: string;
  outputSize?: number;
  width?: number;
  height?: number;
  frameRate?: number;
}

export interface VideoRepository {
  create(record: VideoRecord): Promise<void>;
  get(id: string): Promise<VideoRecord | undefined>;
  list(params: ListParams): Promise<ListResult>;
  setUploadId(id: string, uploadId: string, now: Date): Promise<void>;
  markUploaded(id: string, now: Date): Promise<void>;
  markTranscoding(id: string, jobId: string, now: Date): Promise<void>;
  /** 条件（TRANSCODING であること）を満たさなかった場合は false */
  markReady(id: string, output: ReadyOutput, now: Date): Promise<boolean>;
  /** 条件（DELETING でないこと）を満たさなかった場合は false */
  markError(
    id: string,
    errorCode: string,
    errorMessage: string,
    now: Date,
  ): Promise<boolean>;
  setDistributionStatus(
    id: string,
    status: DistributionStatus,
    now: Date,
  ): Promise<VideoRecord>;
  /** DELETING へ遷移させ、遷移前のレコードを返す */
  markDeleting(id: string, now: Date): Promise<VideoRecord>;
  remove(id: string): Promise<void>;
}

const GSI1_NAME = "GSI1";

export function createVideoRepository(
  tableName: string,
  client: DynamoDBDocumentClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({}),
    { marshallOptions: { removeUndefinedValues: true } },
  ),
): VideoRepository {
  const key = (id: string) => ({ id });

  return {
    async create(record) {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: record,
          ConditionExpression: "attribute_not_exists(id)",
        }),
      );
    },

    async get(id) {
      const result = await client.send(
        new GetCommand({ TableName: tableName, Key: key(id) }),
      );
      return result.Item as VideoRecord | undefined;
    },

    async list({ limit, cursor }) {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: GSI1_NAME,
          KeyConditionExpression: "gsi1pk = :pk",
          ExpressionAttributeValues: { ":pk": VIDEO_GSI1PK },
          // createdAt 降順
          ScanIndexForward: false,
          Limit: limit,
          ExclusiveStartKey:
            cursor === undefined ? undefined : decodeCursor(cursor),
        }),
      );
      return {
        items: (result.Items ?? []) as VideoRecord[],
        nextCursor:
          result.LastEvaluatedKey === undefined
            ? null
            : encodeCursor(result.LastEvaluatedKey),
      };
    },

    async setUploadId(id, uploadId, now) {
      await update(
        client,
        tableName,
        id,
        {
          UpdateExpression: "SET uploadId = :uploadId, updatedAt = :now",
          ConditionExpression:
            "attribute_exists(id) AND #status = :uploadingStatus",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":uploadId": uploadId,
            ":now": now.toISOString(),
            ":uploadingStatus": "UPLOADING",
          },
        },
        "video is not in UPLOADING state",
      );
    },

    async markUploaded(id, now) {
      await update(
        client,
        tableName,
        id,
        {
          UpdateExpression:
            "SET #status = :uploaded, updatedAt = :now REMOVE uploadId",
          ConditionExpression:
            "attribute_exists(id) AND #status = :uploadingStatus",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":uploaded": "UPLOADED",
            ":uploadingStatus": "UPLOADING",
            ":now": now.toISOString(),
          },
        },
        "video is not in UPLOADING state",
      );
    },

    async markTranscoding(id, jobId, now) {
      await update(
        client,
        tableName,
        id,
        {
          UpdateExpression:
            "SET #status = :transcoding, mediaConvertJobId = :jobId, updatedAt = :now",
          ConditionExpression:
            "attribute_exists(id) AND #status = :uploadedStatus",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":transcoding": "TRANSCODING",
            ":uploadedStatus": "UPLOADED",
            ":jobId": jobId,
            ":now": now.toISOString(),
          },
        },
        "video is not in UPLOADED state",
      );
    },

    async markReady(id, output, now) {
      const sets = [
        "#status = :ready",
        "outputKey = :outputKey",
        "updatedAt = :now",
      ];
      const values: Record<string, unknown> = {
        ":ready": "READY",
        ":outputKey": output.outputKey,
        ":now": now.toISOString(),
        ":transcodingStatus": "TRANSCODING",
      };
      for (const field of ["outputSize", "width", "height", "frameRate"] as const) {
        const value = output[field];
        if (value !== undefined) {
          sets.push(`${field} = :${field}`);
          values[`:${field}`] = value;
        }
      }

      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: key(id),
            UpdateExpression: `SET ${sets.join(", ")} REMOVE errorCode, errorMessage`,
            ConditionExpression:
              "attribute_exists(id) AND #status = :transcodingStatus",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: values,
          }),
        );
        return true;
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) return false;
        throw error;
      }
    },

    async markError(id, errorCode, errorMessage, now) {
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: key(id),
            UpdateExpression:
              "SET #status = :error, errorCode = :code, errorMessage = :message, updatedAt = :now REMOVE uploadId",
            ConditionExpression:
              "attribute_exists(id) AND #status <> :deletingStatus",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
              ":error": "ERROR",
              ":code": errorCode,
              ":message": errorMessage.slice(0, 1024),
              ":deletingStatus": "DELETING",
              ":now": now.toISOString(),
            },
          }),
        );
        return true;
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) return false;
        throw error;
      }
    },

    async setDistributionStatus(id, status, now) {
      const result = await update(
        client,
        tableName,
        id,
        {
          UpdateExpression:
            "SET distributionStatus = :distributionStatus, updatedAt = :now",
          ConditionExpression:
            "attribute_exists(id) AND #status <> :deletingStatus",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":distributionStatus": status,
            ":deletingStatus": "DELETING",
            ":now": now.toISOString(),
          },
          ReturnValues: "ALL_NEW",
        },
        "video is being deleted",
      );
      return result as unknown as VideoRecord;
    },

    async markDeleting(id, now) {
      try {
        const result = await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: key(id),
            UpdateExpression: "SET #status = :deleting, updatedAt = :now",
            ConditionExpression: "attribute_exists(id)",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
              ":deleting": "DELETING",
              ":now": now.toISOString(),
            },
            ReturnValues: "ALL_OLD",
          }),
        );
        return result.Attributes as VideoRecord;
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) {
          throw notFound("video not found");
        }
        throw error;
      }
    },

    async remove(id) {
      await client.send(
        new DeleteCommand({ TableName: tableName, Key: key(id) }),
      );
    },
  };
}

async function update(
  client: DynamoDBDocumentClient,
  tableName: string,
  id: string,
  input: Omit<
    ConstructorParameters<typeof UpdateCommand>[0],
    "TableName" | "Key"
  >,
  conflictMessage: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const result = await client.send(
      new UpdateCommand({ TableName: tableName, Key: { id }, ...input }),
    );
    return result.Attributes;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      throw conflict(conflictMessage);
    }
    throw error;
  }
}
