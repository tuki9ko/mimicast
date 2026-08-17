import type { VideoStatus } from "@mimicast/shared";

const LABELS: Record<VideoStatus, string> = {
  UPLOADING: "アップロード中",
  UPLOADED: "変換待ち",
  TRANSCODING: "変換中",
  READY: "配信可能",
  ERROR: "エラー",
  DELETING: "削除中",
};

const TONES: Record<VideoStatus, string> = {
  UPLOADING: "progress",
  UPLOADED: "progress",
  TRANSCODING: "progress",
  READY: "ready",
  ERROR: "error",
  DELETING: "muted",
};

export function VideoStatusBadge({ status }: { status: VideoStatus }) {
  return (
    <span className={`badge badge--${TONES[status]}`}>{LABELS[status]}</span>
  );
}

export function videoStatusLabel(status: VideoStatus): string {
  return LABELS[status];
}
