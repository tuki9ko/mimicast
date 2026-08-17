/**
 * アップロードフォーム（FR-010 / FR-011 / FR-014）。
 *
 * クライアント側の検証は共有パッケージの実装を使い、サーバー側と判定をそろえる。
 * ただしサーバー側の検証が本体であり、こちらは体験を良くするためのもの。
 */

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

import {
  ALLOWED_EXTENSION_LIST,
  formatBytes,
  validateCreateVideoInput,
  type VideoDto,
} from "@mimicast/shared";

import { Button } from "../../../components/Button.tsx";
import { Notice } from "../../../components/Notice.tsx";
import { ProgressBar } from "../../../components/ProgressBar.tsx";
import { useVideoUpload } from "../hooks/useVideoUpload.ts";
import { resolveContentType } from "../services/multipartUpload.ts";

interface UploadFormProps {
  onUploaded: (video: VideoDto) => void;
}

export function UploadForm({ onUploaded }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { state, start, cancel, reset } = useVideoUpload();

  const busy = state.phase === "probing" || state.phase === "uploading" ||
    state.phase === "completing";

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setValidationMessage(null);
    if (selected !== null && title === "") {
      setTitle(selected.name.replace(/\.[^.]+$/, "").slice(0, 100));
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (file === null) {
      setValidationMessage("動画ファイルを選択してください");
      return;
    }

    const validated = validateCreateVideoInput({
      title,
      filename: file.name,
      contentType: resolveContentType(file),
      size: file.size,
    });
    if (!validated.ok) {
      setValidationMessage(validated.message);
      return;
    }

    setValidationMessage(null);
    const uploaded = await start(file, title);
    if (uploaded !== null) onUploaded(uploaded);
  };

  const handleReset = () => {
    setFile(null);
    setTitle("");
    setValidationMessage(null);
    if (fileInputRef.current !== null) fileInputRef.current.value = "";
    reset();
  };

  return (
    <form className="card panel" onSubmit={(event) => void handleSubmit(event)}>
      <h2 className="panel__title">動画をアップロード</h2>

      <label className="field">
        <span className="field__label">動画ファイル</span>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXTENSION_LIST.join(",")}
          disabled={busy}
          onChange={handleFileChange}
        />
        <span className="field__hint">
          対応形式: {ALLOWED_EXTENSION_LIST.join(" / ")}
        </span>
      </label>

      {file !== null && (
        <p className="field__hint">
          {file.name}（{formatBytes(file.size)}）
        </p>
      )}

      <label className="field">
        <span className="field__label">タイトル</span>
        <input
          type="text"
          value={title}
          maxLength={100}
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="夜桜"
        />
      </label>

      {validationMessage !== null && (
        <Notice tone="error">{validationMessage}</Notice>
      )}

      {state.phase === "probing" && (
        <p className="field__hint">動画情報を取得しています...</p>
      )}

      {(state.phase === "uploading" || state.phase === "completing") && (
        <div className="upload-progress">
          <ProgressBar percent={state.percent} label="アップロード進捗" />
          <p className="field__hint">
            {formatBytes(state.loadedBytes)} / {formatBytes(state.totalBytes)}
          </p>
        </div>
      )}

      {state.phase === "done" && (
        <Notice tone="info" title="アップロード完了">
          変換待ちです。変換が終わると配信可能になります。
        </Notice>
      )}

      {state.phase === "cancelled" && (
        <Notice tone="info">アップロードを中止しました。</Notice>
      )}

      {state.phase === "error" && (
        <Notice tone="error" title="アップロードに失敗しました">
          {state.errorMessage}
        </Notice>
      )}

      <div className="panel__actions">
        {busy ? (
          <Button variant="danger" onClick={() => void cancel()}>
            中止する
          </Button>
        ) : (
          <>
            <Button type="submit" variant="primary" disabled={file === null}>
              アップロード開始
            </Button>
            <Button variant="ghost" onClick={handleReset}>
              クリア
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
