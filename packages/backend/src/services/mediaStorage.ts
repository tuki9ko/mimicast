/**
 * media bucket に対する S3 操作。
 *
 * 動画本体は Lambda を経由させない。ブラウザ → S3 の Multipart Upload を
 * Presigned URL で行わせるための操作のみをここへ置く。
 */

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { internalError } from "../http/errors.ts";

export interface UploadedPart {
  partNumber: number;
  etag: string;
}

export interface MediaStorage {
  createMultipartUpload(key: string, contentType: string): Promise<string>;
  presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn: number,
  ): Promise<string>;
  completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: UploadedPart[],
  ): Promise<void>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
  /** オブジェクトが存在しない場合は undefined */
  headObjectSize(key: string): Promise<number | undefined>;
  deletePrefix(prefix: string): Promise<void>;
}

const DELETE_BATCH_SIZE = 1000;

export function createMediaStorage(
  bucket: string,
  client: S3Client = new S3Client({}),
): MediaStorage {
  return {
    async createMultipartUpload(key, contentType) {
      const result = await client.send(
        new CreateMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          ContentType: contentType,
        }),
      );
      if (result.UploadId === undefined) {
        throw internalError("failed to create multipart upload");
      }
      return result.UploadId;
    },

    async presignUploadPart(key, uploadId, partNumber, expiresIn) {
      return getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn },
      );
    },

    async completeMultipartUpload(key, uploadId, parts) {
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts.map((part) => ({
              PartNumber: part.partNumber,
              ETag: part.etag,
            })),
          },
        }),
      );
    },

    async abortMultipartUpload(key, uploadId) {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    },

    async headObjectSize(key) {
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        return result.ContentLength;
      } catch (error) {
        if (error instanceof NotFound) return undefined;
        throw error;
      }
    },

    async deletePrefix(prefix) {
      let continuationToken: string | undefined;
      do {
        const listed = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
            MaxKeys: DELETE_BATCH_SIZE,
          }),
        );
        const keys = (listed.Contents ?? [])
          .map((object) => object.Key)
          .filter((key): key is string => key !== undefined);

        if (keys.length > 0) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
            }),
          );
        }
        continuationToken = listed.IsTruncated
          ? listed.NextContinuationToken
          : undefined;
      } while (continuationToken !== undefined);
    },
  };
}
