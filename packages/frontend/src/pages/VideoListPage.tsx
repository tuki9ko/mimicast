import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { VideoDto } from "@mimicast/shared";

import { Button } from "../components/Button.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { Notice } from "../components/Notice.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { VideoCard } from "../features/videos/components/VideoCard.tsx";
import {
  useDeleteVideo,
  useVideos,
} from "../features/videos/hooks/useVideos.ts";

export function VideoListPage() {
  const navigate = useNavigate();
  // カーソルの履歴を持ち、前ページへ戻れるようにする
  const [cursors, setCursors] = useState<string[]>([]);
  const currentCursor = cursors.at(-1);
  const videos = useVideos(currentCursor);
  const deleteVideo = useDeleteVideo();
  const [target, setTarget] = useState<VideoDto | null>(null);

  const handleDelete = () => {
    if (target === null) return;
    deleteVideo.mutate(target.id, {
      onSettled: () => setTarget(null),
    });
  };

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">動画一覧</h1>
        <Button variant="primary" onClick={() => void navigate("/upload")}>
          アップロード
        </Button>
      </div>

      {videos.isPending && <Spinner label="読み込み中" />}

      {videos.isError && (
        <Notice tone="error" title="一覧を取得できませんでした">
          {videos.error.message}
        </Notice>
      )}

      {deleteVideo.isError && (
        <Notice tone="error" title="削除に失敗しました">
          {deleteVideo.error.message}
        </Notice>
      )}

      {videos.data !== undefined && videos.data.items.length === 0 && (
        <Notice tone="info">動画がまだありません。</Notice>
      )}

      <div className="video-list">
        {videos.data?.items.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            onOpen={(id) => void navigate(`/videos/${id}`)}
            onDelete={setTarget}
          />
        ))}
      </div>

      <div className="pagination">
        <Button
          variant="ghost"
          disabled={cursors.length === 0}
          onClick={() => setCursors((current) => current.slice(0, -1))}
        >
          前のページ
        </Button>
        <Button
          variant="ghost"
          disabled={
            videos.data === undefined || videos.data.nextCursor === null
          }
          onClick={() =>
            setCursors((current) => {
              const next = videos.data?.nextCursor;
              return next === undefined || next === null
                ? current
                : [...current, next];
            })
          }
        >
          次のページ
        </Button>
      </div>

      <ConfirmDialog
        open={target !== null}
        title="この動画を削除しますか？"
        confirmLabel="削除する"
        busy={deleteVideo.isPending}
        onCancel={() => setTarget(null)}
        onConfirm={handleDelete}
      >
        <p>{target?.title}</p>
        <p className="dialog__note">
          元動画・変換済み動画・メタデータをすべて削除します。この操作は取り消せません。
        </p>
      </ConfirmDialog>
    </div>
  );
}
