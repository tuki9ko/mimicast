/**
 * CloudFront Signed URL の生成。
 *
 * - 署名はバックエンドのみで行う。秘密鍵をフロントエンドへ渡さない。
 * - Canned Policy を使う（VRChat クライアントの送信元 IP は事前に判明しないため）。
 * - 生成した URL は DB へ保存しない。ログへも出力しない。
 */

import { getSignedUrl } from "@aws-sdk/cloudfront-signer";

import type { SecretReader } from "./secrets.ts";

export interface PlaybackUrlSigner {
  /** objectKey は videos/{videoId}/video.mp4（CloudFront のパスと 1 対 1） */
  sign(objectKey: string, expiresAt: Date): Promise<string>;
}

export interface PlaybackUrlSignerOptions {
  /** 配信用 CloudFront のドメイン（例: video.example.jp） */
  domain: string;
  keyPairId: string;
  privateKeySecretArn: string;
  secretReader: SecretReader;
}

export function createPlaybackUrlSigner(
  options: PlaybackUrlSignerOptions,
): PlaybackUrlSigner {
  return {
    async sign(objectKey, expiresAt) {
      const privateKey = await options.secretReader.getSecret(
        options.privateKeySecretArn,
      );
      return getSignedUrl({
        url: `https://${options.domain}/${objectKey}`,
        keyPairId: options.keyPairId,
        privateKey,
        // dateLessThan のみを指定すると Canned Policy になる
        dateLessThan: expiresAt.toISOString(),
      });
    },
  };
}
