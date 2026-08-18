/**
 * 再生用 URL の発行パネル。
 */

import { useState } from "react";

import {
  DEFAULT_PLAYBACK_EXPIRES_IN,
  PLAYBACK_EXPIRES_OPTIONS,
  formatDateTime,
  formatExpiresIn,
  type VideoDto,
} from "@mimicast/shared";

import { Button } from "../../../components/Button.tsx";
import { Notice } from "../../../components/Notice.tsx";
import { copyToClipboard } from "../../../lib/browser/clipboard.ts";
import { usePlaybackUrl } from "../hooks/usePlaybackUrl.ts";

interface PlaybackUrlPanelProps {
  video: VideoDto;
}

export function PlaybackUrlPanel({ video }: PlaybackUrlPanelProps) {
  const [expiresIn, setExpiresIn] = useState<number>(
    DEFAULT_PLAYBACK_EXPIRES_IN,
  );
  const [copied, setCopied] = useState(false);
  const issue = usePlaybackUrl(video.id);

  const canIssue =
    video.status === "READY" && video.distributionStatus === "ENABLED";

  const handleCopy = async () => {
    if (issue.data === undefined) return;
    await copyToClipboard(issue.data.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="card panel">
      <h2 className="panel__title">再生用 URL</h2>

      {!canIssue && (
        <Notice tone="info">
          配信可能（READY）かつ配信 ON の動画のみ URL を発行できます。
        </Notice>
      )}

      <div className="field">
        <span className="field__label">有効期限</span>
        <div className="chips">
          {PLAYBACK_EXPIRES_OPTIONS.map((option) => (
            <Button
              key={option}
              variant={option === expiresIn ? "primary" : "ghost"}
              aria-pressed={option === expiresIn}
              onClick={() => setExpiresIn(option)}
            >
              {formatExpiresIn(option)}
            </Button>
          ))}
        </div>
      </div>

      <Notice tone="warning">
        URL の有効期限は「視聴予定時刻 + 余裕」を見込んで選択してください。
        期限が切れると、再生中でもシーク操作で再生できなくなります。
      </Notice>

      <Button
        variant="primary"
        disabled={!canIssue || issue.isPending}
        onClick={() => issue.mutate(expiresIn)}
      >
        {issue.isPending ? "発行中..." : "URL を発行"}
      </Button>

      {issue.isError && (
        <Notice tone="error">{issue.error.message}</Notice>
      )}

      {issue.data !== undefined && (
        <div className="playback-url">
          <label className="field">
            <span className="field__label">
              発行済み URL（有効期限: {formatDateTime(issue.data.expiresAt)}）
            </span>
            <textarea
              className="playback-url__value"
              readOnly
              rows={3}
              value={issue.data.url}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <Button variant="secondary" onClick={() => void handleCopy()}>
            {copied ? "コピーしました" : "コピー"}
          </Button>
        </div>
      )}
    </section>
  );
}
