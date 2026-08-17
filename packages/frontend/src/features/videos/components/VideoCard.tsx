/**
 * 一覧に表示する 1 件分のカード。
 *
 * ルーティングに依存させないため、遷移処理は onOpen として上位から注入する（設計 3.2）。
 */

import {
  formatBytes,
  formatDateTime,
  formatOutputProfile,
  type VideoDto,
} from "@mimicast/shared";

import { Button } from "../../../components/Button.tsx";
import { VideoStatusBadge } from "./VideoStatusBadge.tsx";

interface VideoCardProps {
  video: VideoDto;
  onOpen: (id: string) => void;
  onDelete: (video: VideoDto) => void;
}

export function VideoCard({ video, onOpen, onDelete }: VideoCardProps) {
  return (
    <article className="card video-card">
      <div className="video-card__main">
        <h2 className="video-card__title">{video.title}</h2>
        <p className="video-card__filename">{video.originalFilename}</p>

        <div className="video-card__meta">
          <VideoStatusBadge status={video.status} />
          <span>{formatOutputProfile(video)}</span>
          <span>{formatBytes(video.outputSize)}</span>
          <span
            className={
              video.distributionStatus === "ENABLED"
                ? "badge badge--ready"
                : "badge badge--muted"
            }
          >
            配信: {video.distributionStatus === "ENABLED" ? "ON" : "OFF"}
          </span>
        </div>

        {video.status === "ERROR" && video.errorMessage !== undefined && (
          <p className="video-card__error">
            {video.errorCode}: {video.errorMessage}
          </p>
        )}

        <dl className="video-card__timestamps">
          <div>
            <dt>作成</dt>
            <dd>{formatDateTime(video.createdAt)}</dd>
          </div>
          <div>
            <dt>更新</dt>
            <dd>{formatDateTime(video.updatedAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="video-card__actions">
        <Button variant="primary" onClick={() => onOpen(video.id)}>
          詳細
        </Button>
        <Button variant="danger" onClick={() => onDelete(video)}>
          削除
        </Button>
      </div>
    </article>
  );
}
