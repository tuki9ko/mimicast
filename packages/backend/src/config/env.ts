/**
 * 環境変数の読み込み。
 *
 * 設計 22 章に対応する。
 * CloudFront 署名秘密鍵の「値」は環境変数へ入れない。入れてよいのは Secret の ARN のみ。
 */

import { DEFAULT_MAX_UPLOAD_BYTES } from "@mimicast/shared";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`environment variable ${name} is not set`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

export interface ApiConfig {
  region: string;
  mediaBucket: string;
  tableName: string;
  /** 配信用 CloudFront のドメイン（例: video.example.jp） */
  cfDomain: string;
  cfKeyPairId: string;
  /** 秘密鍵そのものではなく Secret の ARN */
  cfPrivateKeySecretArn: string;
  mediaConvertRoleArn: string;
  mediaConvertEndpoint?: string;
  mediaConvertQueueArn?: string;
  maxUploadBytes: number;
}

export interface EventConfig {
  region: string;
  mediaBucket: string;
  tableName: string;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid numeric environment variable: ${value}`);
  }
  return parsed;
}

let apiConfig: ApiConfig | undefined;

export function getApiConfig(): ApiConfig {
  if (apiConfig !== undefined) return apiConfig;
  apiConfig = {
    region: requireEnv("AWS_REGION"),
    mediaBucket: requireEnv("MEDIA_BUCKET"),
    tableName: requireEnv("TABLE_NAME"),
    cfDomain: requireEnv("CF_DOMAIN"),
    cfKeyPairId: requireEnv("CF_KEY_PAIR_ID"),
    cfPrivateKeySecretArn: requireEnv("CF_PRIVATE_KEY_SECRET_ARN"),
    mediaConvertRoleArn: requireEnv("MEDIACONVERT_ROLE_ARN"),
    mediaConvertEndpoint: optionalEnv("MEDIACONVERT_ENDPOINT"),
    mediaConvertQueueArn: optionalEnv("MEDIACONVERT_QUEUE_ARN"),
    maxUploadBytes: parsePositiveInt(
      optionalEnv("MAX_UPLOAD_BYTES"),
      DEFAULT_MAX_UPLOAD_BYTES,
    ),
  };
  return apiConfig;
}

let eventConfig: EventConfig | undefined;

export function getEventConfig(): EventConfig {
  if (eventConfig !== undefined) return eventConfig;
  eventConfig = {
    region: requireEnv("AWS_REGION"),
    mediaBucket: requireEnv("MEDIA_BUCKET"),
    tableName: requireEnv("TABLE_NAME"),
  };
  return eventConfig;
}
