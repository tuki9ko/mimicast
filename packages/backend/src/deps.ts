/**
 * ルートハンドラが利用する依存のまとめ。
 *
 * ハンドラは依存を引数で受け取るため、テストでは差し替えられる。
 */

import { ulid } from "ulid";

import { getApiConfig, type ApiConfig } from "./config/env.ts";
import { createVideoRepository, type VideoRepository } from "./repositories/videoRepository.ts";
import { createMediaStorage, type MediaStorage } from "./services/mediaStorage.ts";
import { createTranscoder, type Transcoder } from "./services/mediaConvert.ts";
import { createPlaybackUrlSigner, type PlaybackUrlSigner } from "./services/playbackUrl.ts";
import { createSecretReader } from "./services/secrets.ts";

export interface Dependencies {
  config: ApiConfig;
  videos: VideoRepository;
  storage: MediaStorage;
  transcoder: Transcoder;
  signer: PlaybackUrlSigner;
  now: () => Date;
  newId: () => string;
}

export function createDependencies(): Dependencies {
  const config = getApiConfig();
  const secretReader = createSecretReader();

  return {
    config,
    videos: createVideoRepository(config.tableName),
    storage: createMediaStorage(config.mediaBucket),
    transcoder: createTranscoder({
      roleArn: config.mediaConvertRoleArn,
      endpoint: config.mediaConvertEndpoint,
      queueArn: config.mediaConvertQueueArn,
    }),
    signer: createPlaybackUrlSigner({
      domain: config.cfDomain,
      keyPairId: config.cfKeyPairId,
      privateKeySecretArn: config.cfPrivateKeySecretArn,
      secretReader,
    }),
    now: () => new Date(),
    // ULID は辞書順ソートが生成時刻順と一致する（設計 6 章）
    newId: () => ulid(),
  };
}
