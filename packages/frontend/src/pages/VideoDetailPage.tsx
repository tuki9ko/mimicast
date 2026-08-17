import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  formatBytes,
  formatDateTime,
  formatResolution,
} from "@mimicast/shared";

import { Button } from "../components/Button.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { Notice } from "../components/Notice.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { PlaybackUrlPanel } from "../features/playback/components/PlaybackUrlPanel.tsx";
import { DistributionToggle } from "../features/videos/components/DistributionToggle.tsx";
import { VideoStatusBadge } from "../features/videos/components/VideoStatusBadge.tsx";
import {
  useDeleteVideo,
  useUpdateDistribution,
  useVideo,
} from "../features/videos/hooks/useVideos.ts";

export function VideoDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const video = useVideo(id);
  const updateDistribution = useUpdateDistribution(id);
  const deleteVideo = useDeleteVideo();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (video.isPending) {
    return (
      <div className="page">
        <Spinner label="読み込み中" />
      </div>
    );
  }

  if (video.isError) {
    return (
      <div className="page">
        <Notice tone="error" title="動画を取得できませんでした">
          {video.error.message}
        </Notice>
        <Button variant="ghost" onClick={() => void navigate("/")}>
          一覧へ戻る
        </Button>
      </div>
    );
  }

  const item = video.data;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <Button variant="ghost" onClick={() => void navigate("/")}>
            ← 一覧へ戻る
          </Button>
          <h1 className="page__title">{item.title}</h1>
          <p className="page__subtitle">{item.originalFilename}</p>
        </div>
        <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
          削除
        </Button>
      </div>

      <section className="card panel">
        <h2 className="panel__title">状態</h2>
        <dl className="detail-grid">
          <div>
            <dt>ステータス</dt>
            <dd>
              <VideoStatusBadge status={item.status} />
            </dd>
          </div>
          <div>
            <dt>出力解像度</dt>
            <dd>{formatResolution(item.width, item.height)}</dd>
          </div>
          <div>
            <dt>フレームレート</dt>
            <dd>
              {item.frameRate === undefined ? "-" : `${item.frameRate} fps`}
            </dd>
          </div>
          <div>
            <dt>出力サイズ</dt>
            <dd>{formatBytes(item.outputSize)}</dd>
          </div>
          <div>
            <dt>元解像度</dt>
            <dd>{formatResolution(item.sourceWidth, item.sourceHeight)}</dd>
          </div>
          <div>
            <dt>元サイズ</dt>
            <dd>{formatBytes(item.sourceSize)}</dd>
          </div>
          <div>
            <dt>作成日時</dt>
            <dd>{formatDateTime(item.createdAt)}</dd>
          </div>
          <div>
            <dt>更新日時</dt>
            <dd>{formatDateTime(item.updatedAt)}</dd>
          </div>
        </dl>

        {item.status === "ERROR" && (
          <Notice tone="error" title="変換に失敗しました">
            {item.errorCode}: {item.errorMessage}
            <br />
            この動画は削除して、再度アップロードしてください。
          </Notice>
        )}
      </section>

      <section className="card panel">
        <h2 className="panel__title">配信許可</h2>
        <DistributionToggle
          value={item.distributionStatus}
          pending={updateDistribution.isPending}
          onChange={(next) => updateDistribution.mutate(next)}
        />
        {updateDistribution.isError && (
          <Notice tone="error">{updateDistribution.error.message}</Notice>
        )}
        <Notice tone="warning">
          配信を OFF にしても、すでに発行済みの URL は有効期限が切れるまで再生できます。
        </Notice>
      </section>

      <PlaybackUrlPanel video={item} />

      <ConfirmDialog
        open={confirmingDelete}
        title="この動画を削除しますか？"
        confirmLabel="削除する"
        busy={deleteVideo.isPending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() =>
          deleteVideo.mutate(item.id, {
            onSuccess: () => {
              setConfirmingDelete(false);
              void navigate("/");
            },
          })
        }
      >
        <p>{item.title}</p>
        <p className="dialog__note">
          元動画・変換済み動画・メタデータをすべて削除します。この操作は取り消せません。
        </p>
      </ConfirmDialog>
    </div>
  );
}
