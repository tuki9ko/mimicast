/**
 * テスト用のインメモリ実装。AWS へアクセスせずにルートハンドラを検証する。
 */

import type { DistributionStatus } from "@mimicast/shared";

import type { ApiConfig } from "../config/env.ts";
import type { Dependencies } from "../deps.ts";
import type { VideoRecord } from "../domain/video.ts";
import { conflict, notFound } from "../http/errors.ts";
import type { RequestContext } from "../http/request.ts";
import type {
  ListParams,
  ListResult,
  ReadyOutput,
  VideoRepository,
} from "../repositories/videoRepository.ts";
import type { Transcoder } from "../services/mediaConvert.ts";
import type { MediaStorage, UploadedPart } from "../services/mediaStorage.ts";
import type { PlaybackUrlSigner } from "../services/playbackUrl.ts";

export class FakeVideoRepository implements VideoRepository {
  readonly items = new Map<string, VideoRecord>();

  seed(record: VideoRecord): VideoRecord {
    this.items.set(record.id, record);
    return record;
  }

  async create(record: VideoRecord): Promise<void> {
    if (this.items.has(record.id)) throw conflict("already exists");
    this.items.set(record.id, record);
  }

  async get(id: string): Promise<VideoRecord | undefined> {
    return this.items.get(id);
  }

  async list({ limit, cursor }: ListParams): Promise<ListResult> {
    const sorted = [...this.items.values()].sort((a, b) =>
      b.gsi1sk.localeCompare(a.gsi1sk),
    );
    const startIndex =
      cursor === undefined
        ? 0
        : sorted.findIndex((item) => item.id === cursor) + 1;
    const page = sorted.slice(startIndex, startIndex + limit);
    const last = page.at(-1);
    const hasMore = startIndex + limit < sorted.length;
    return {
      items: page,
      nextCursor: hasMore && last !== undefined ? last.id : null,
    };
  }

  private mutate(id: string, patch: Partial<VideoRecord>): VideoRecord {
    const current = this.items.get(id);
    if (current === undefined) throw notFound("video not found");
    const next = { ...current, ...patch };
    this.items.set(id, next);
    return next;
  }

  async setUploadId(id: string, uploadId: string, now: Date): Promise<void> {
    const current = this.items.get(id);
    if (current === undefined || current.status !== "UPLOADING") {
      throw conflict("video is not in UPLOADING state");
    }
    this.mutate(id, { uploadId, updatedAt: now.toISOString() });
  }

  async markUploaded(id: string, now: Date): Promise<void> {
    const current = this.items.get(id);
    if (current === undefined || current.status !== "UPLOADING") {
      throw conflict("video is not in UPLOADING state");
    }
    const next = { ...current, status: "UPLOADED" as const, updatedAt: now.toISOString() };
    delete next.uploadId;
    this.items.set(id, next);
  }

  async markTranscoding(id: string, jobId: string, now: Date): Promise<void> {
    const current = this.items.get(id);
    if (current === undefined || current.status !== "UPLOADED") {
      throw conflict("video is not in UPLOADED state");
    }
    this.mutate(id, {
      status: "TRANSCODING",
      mediaConvertJobId: jobId,
      updatedAt: now.toISOString(),
    });
  }

  async markReady(
    id: string,
    output: ReadyOutput,
    now: Date,
  ): Promise<boolean> {
    const current = this.items.get(id);
    if (current === undefined || current.status !== "TRANSCODING") return false;
    this.mutate(id, {
      status: "READY",
      ...output,
      updatedAt: now.toISOString(),
    });
    return true;
  }

  async markError(
    id: string,
    errorCode: string,
    errorMessage: string,
    now: Date,
  ): Promise<boolean> {
    const current = this.items.get(id);
    if (current === undefined || current.status === "DELETING") return false;
    this.mutate(id, {
      status: "ERROR",
      errorCode,
      errorMessage,
      updatedAt: now.toISOString(),
    });
    return true;
  }

  async setDistributionStatus(
    id: string,
    status: DistributionStatus,
    now: Date,
  ): Promise<VideoRecord> {
    const current = this.items.get(id);
    if (current === undefined) throw notFound("video not found");
    if (current.status === "DELETING") throw conflict("video is being deleted");
    return this.mutate(id, {
      distributionStatus: status,
      updatedAt: now.toISOString(),
    });
  }

  async markDeleting(id: string, now: Date): Promise<VideoRecord> {
    const current = this.items.get(id);
    if (current === undefined) throw notFound("video not found");
    this.mutate(id, { status: "DELETING", updatedAt: now.toISOString() });
    return current;
  }

  async remove(id: string): Promise<void> {
    this.items.delete(id);
  }
}

export class FakeMediaStorage implements MediaStorage {
  readonly created: { key: string; contentType: string }[] = [];
  readonly presigned: { key: string; uploadId: string; partNumber: number }[] =
    [];
  readonly completed: { key: string; uploadId: string; parts: UploadedPart[] }[] =
    [];
  readonly aborted: { key: string; uploadId: string }[] = [];
  readonly deletedPrefixes: string[] = [];
  objectSize: number | undefined = 1234;
  nextUploadId = "upload-1";
  abortShouldFail = false;

  async createMultipartUpload(key: string, contentType: string) {
    this.created.push({ key, contentType });
    return this.nextUploadId;
  }

  async presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
  ): Promise<string> {
    this.presigned.push({ key, uploadId, partNumber });
    return `https://s3.example/${key}?partNumber=${partNumber}`;
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: UploadedPart[],
  ): Promise<void> {
    this.completed.push({ key, uploadId, parts });
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    if (this.abortShouldFail) throw new Error("abort failed");
    this.aborted.push({ key, uploadId });
  }

  async headObjectSize(): Promise<number | undefined> {
    return this.objectSize;
  }

  async deletePrefix(prefix: string): Promise<void> {
    this.deletedPrefixes.push(prefix);
  }
}

export class FakeTranscoder implements Transcoder {
  readonly jobs: { videoId: string; inputUri: string; destinationUri: string }[] =
    [];
  readonly cancelled: string[] = [];
  nextJobId = "job-1";
  createShouldFail = false;

  async createJob(input: {
    videoId: string;
    inputUri: string;
    destinationUri: string;
  }): Promise<string> {
    if (this.createShouldFail) throw new Error("CreateJob failed");
    this.jobs.push(input);
    return this.nextJobId;
  }

  async cancelJob(jobId: string): Promise<void> {
    this.cancelled.push(jobId);
  }
}

export class FakePlaybackUrlSigner implements PlaybackUrlSigner {
  readonly signed: { objectKey: string; expiresAt: Date }[] = [];

  async sign(objectKey: string, expiresAt: Date): Promise<string> {
    this.signed.push({ objectKey, expiresAt });
    const epoch = Math.floor(expiresAt.getTime() / 1000);
    return `https://video.example.jp/${objectKey}?Expires=${epoch}&Signature=sig&Key-Pair-Id=K123`;
  }
}

export const TEST_CONFIG: ApiConfig = {
  region: "ap-northeast-1",
  mediaBucket: "mimicast-media-test",
  tableName: "mimicast-videos-test",
  cfDomain: "video.example.jp",
  cfKeyPairId: "K123",
  cfPrivateKeySecretArn: "arn:aws:secretsmanager:ap-northeast-1:1:secret:x",
  mediaConvertRoleArn: "arn:aws:iam::1:role/mediaconvert",
  maxUploadBytes: 64 * 1024 * 1024 * 1024,
};

export interface TestDependencies extends Dependencies {
  videos: FakeVideoRepository;
  storage: FakeMediaStorage;
  transcoder: FakeTranscoder;
  signer: FakePlaybackUrlSigner;
}

export function createTestDependencies(
  overrides: Partial<Dependencies> = {},
): TestDependencies {
  const deps: TestDependencies = {
    config: TEST_CONFIG,
    videos: new FakeVideoRepository(),
    storage: new FakeMediaStorage(),
    transcoder: new FakeTranscoder(),
    signer: new FakePlaybackUrlSigner(),
    now: () => new Date("2026-08-17T00:00:00.000Z"),
    newId: () => "01K2H4ZBV3GAC5YKZCGMKAH8YX",
    ...overrides,
  } as TestDependencies;
  return deps;
}

export function createTestContext(
  routeKey: string,
  options: {
    pathParameters?: Record<string, string>;
    queryStringParameters?: Record<string, string>;
    body?: unknown;
  } = {},
): RequestContext {
  return {
    routeKey,
    pathParameters: options.pathParameters ?? {},
    queryStringParameters: options.queryStringParameters ?? {},
    body: options.body,
    userId: "test-user",
    requestId: "test-request",
  };
}
