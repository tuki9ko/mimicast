/**
 * MediaConvert のジョブ定義の組み立て（純関数）。
 *
 * Job Template を使わず Lambda 内で組み立てるのは、解像度が動的に決まるため。
 * 固定部分をここへ切り出し、テストで検証できるようにしている。
 */

import type { CreateJobCommandInput } from "@aws-sdk/client-mediaconvert";

import { resolveOutputResolution } from "@mimicast/shared";

type JobSettings = NonNullable<CreateJobCommandInput["Settings"]>;

export interface BuildJobSettingsInput {
  /** s3://{bucket}/source/{videoId}/source.{ext} */
  inputUri: string;
  /** s3://{bucket}/videos/{videoId}/video （末尾に "/" を付けない・拡張子も付けない） */
  destinationUri: string;
  sourceWidth?: number;
  sourceHeight?: number;
}

const AUDIO_SELECTOR_NAME = "Audio Selector 1";

/** QVBR の最大ビットレート（12 Mbps）。 */
export const MAX_BITRATE = 12_000_000;

/** QVBR 品質レベル。 */
export const QVBR_QUALITY_LEVEL = 8;

export function buildJobSettings(input: BuildJobSettingsInput): JobSettings {
  const resolution = resolveOutputResolution(
    input.sourceWidth,
    input.sourceHeight,
  );

  return {
    TimecodeConfig: { Source: "ZEROBASED" },
    Inputs: [
      {
        FileInput: input.inputUri,
        TimecodeSource: "ZEROBASED",
        AudioSelectors: {
          [AUDIO_SELECTOR_NAME]: {
            DefaultSelection: "DEFAULT",
            Offset: 0,
            ProgramSelection: 1,
          },
        },
        VideoSelector: {
          ColorSpace: "FOLLOW",
          // 回転メタデータを持つ元動画を正しい向きで出力する
          Rotate: "AUTO",
        },
        FilterEnable: "AUTO",
        DeblockFilter: "DISABLED",
        DenoiseFilter: "DISABLED",
        PsiControl: "USE_PSI",
      },
    ],
    OutputGroups: [
      {
        Name: "File Group",
        OutputGroupSettings: {
          Type: "FILE_GROUP_SETTINGS",
          FileGroupSettings: { Destination: input.destinationUri },
        },
        // 出力は 1 つのみ（複数にすると NameModifier が必須になる）
        Outputs: [
          {
            ContainerSettings: {
              Container: "MP4",
              Mp4Settings: {
                CslgAtom: "INCLUDE",
                FreeSpaceBox: "EXCLUDE",
                // 再生開始を早め、Range Request と相性を良くする
                MoovPlacement: "PROGRESSIVE_DOWNLOAD",
              },
            },
            VideoDescription: {
              // 1080p 以下の入力では Width/Height を指定せず、入力解像度へ追従させる。
              // 指定するとアップスケールされてしまうため。
              ...(resolution === undefined
                ? {}
                : {
                    Width: resolution.width,
                    Height: resolution.height,
                    ScalingBehavior: "DEFAULT" as const,
                  }),
              AntiAlias: "ENABLED",
              RespondToAfd: "NONE",
              AfdSignaling: "NONE",
              ColorMetadata: "INSERT",
              TimecodeInsertion: "DISABLED",
              Sharpness: 50,
              CodecSettings: {
                Codec: "H_264",
                H264Settings: {
                  InterlaceMode: "PROGRESSIVE",
                  CodecProfile: "HIGH",
                  CodecLevel: "AUTO",
                  EntropyEncoding: "CABAC",
                  Syntax: "DEFAULT",
                  RateControlMode: "QVBR",
                  QvbrSettings: { QvbrQualityLevel: QVBR_QUALITY_LEVEL },
                  MaxBitrate: MAX_BITRATE,
                  QualityTuningLevel: "SINGLE_PASS_HQ",
                  // 元動画のフレームレートへ追従する。SPECIFIED にすると
                  // 30fps の入力を 60fps へ水増ししてしまう。
                  FramerateControl: "INITIALIZE_FROM_SOURCE",
                  FramerateConversionAlgorithm: "DUPLICATE_DROP",
                  ParControl: "INITIALIZE_FROM_SOURCE",
                  GopSizeUnits: "AUTO",
                  SceneChangeDetect: "TRANSITION_DETECTION",
                  SpatialAdaptiveQuantization: "ENABLED",
                  TemporalAdaptiveQuantization: "ENABLED",
                  NumberBFramesBetweenReferenceFrames: 2,
                  GopBReference: "ENABLED",
                },
              },
            },
            AudioDescriptions: [
              {
                AudioSourceName: AUDIO_SELECTOR_NAME,
                AudioTypeControl: "FOLLOW_INPUT",
                LanguageCodeControl: "FOLLOW_INPUT",
                CodecSettings: {
                  Codec: "AAC",
                  AacSettings: {
                    // AAC-LC / 48kHz / ステレオ
                    CodecProfile: "LC",
                    CodingMode: "CODING_MODE_2_0",
                    SampleRate: 48_000,
                    Bitrate: 192_000,
                    RateControlMode: "CBR",
                    RawFormat: "NONE",
                    Specification: "MPEG4",
                    AudioDescriptionBroadcasterMix: "NORMAL",
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

/** s3:// 形式の URI を組み立てる。 */
export function s3Uri(bucket: string, key: string): string {
  return `s3://${bucket}/${key}`;
}
