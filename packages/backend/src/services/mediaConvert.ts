/**
 * MediaConvert のジョブ操作。
 */

import {
  CancelJobCommand,
  MediaConvertClient,
} from "@aws-sdk/client-mediaconvert";
import { CreateJobCommand } from "@aws-sdk/client-mediaconvert";

import { internalError } from "../http/errors.ts";
import {
  buildJobSettings,
  type BuildJobSettingsInput,
} from "./mediaConvertJob.ts";

export interface CreateTranscodeJobInput extends BuildJobSettingsInput {
  videoId: string;
}

export interface Transcoder {
  createJob(input: CreateTranscodeJobInput): Promise<string>;
  cancelJob(jobId: string): Promise<void>;
}

export interface TranscoderOptions {
  roleArn: string;
  /** アカウント固有エンドポイント。未設定ならリージョナルエンドポイントを使う */
  endpoint?: string;
  /** 未設定なら既定の On-Demand キュー */
  queueArn?: string;
}

export function createTranscoder(
  options: TranscoderOptions,
  client: MediaConvertClient = new MediaConvertClient(
    options.endpoint === undefined ? {} : { endpoint: options.endpoint },
  ),
): Transcoder {
  return {
    async createJob(input) {
      const result = await client.send(
        new CreateJobCommand({
          Role: options.roleArn,
          Queue: options.queueArn,
          Settings: buildJobSettings(input),
          // 完了イベントから動画レコードを特定するために必須
          UserMetadata: { videoId: input.videoId },
          StatusUpdateInterval: "SECONDS_60",
          AccelerationSettings: { Mode: "DISABLED" },
        }),
      );
      const jobId = result.Job?.Id;
      if (jobId === undefined) {
        throw internalError("MediaConvert job id was not returned");
      }
      return jobId;
    },

    async cancelJob(jobId) {
      await client.send(new CancelJobCommand({ Id: jobId }));
    },
  };
}
