/**
 * Secrets Manager からの秘密鍵取得。
 *
 * 設計 12.2 / NFR-004 に対応する。
 * 秘密鍵の値そのものを環境変数へ入れない。環境変数へ入れてよいのは ARN のみ。
 * 実行環境のグローバルスコープでキャッシュし、呼び出しごとの GetSecretValue を避ける。
 */

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

import { internalError } from "../http/errors.ts";

export interface SecretReader {
  getSecret(secretId: string): Promise<string>;
}

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000;

export function createSecretReader(
  client: SecretsManagerClient = new SecretsManagerClient({}),
  ttlMs: number = DEFAULT_TTL_MS,
  now: () => number = Date.now,
): SecretReader {
  const cache = new Map<string, CacheEntry>();

  return {
    async getSecret(secretId) {
      const cached = cache.get(secretId);
      if (cached !== undefined && cached.expiresAt > now()) {
        return cached.value;
      }

      const result = await client.send(
        new GetSecretValueCommand({ SecretId: secretId }),
      );
      const value =
        result.SecretString ??
        (result.SecretBinary === undefined
          ? undefined
          : Buffer.from(result.SecretBinary).toString("utf8"));

      if (value === undefined || value === "") {
        throw internalError("secret value is empty");
      }

      cache.set(secretId, { value, expiresAt: now() + ttlMs });
      return value;
    },
  };
}
