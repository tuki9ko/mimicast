/**
 * アップロード全体の進行状態を扱う（FR-014 / FR-015）。
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import type { VideoDto } from "@mimicast/shared";

import * as uploadsApi from "../../../lib/api/uploads.ts";
import * as videosApi from "../../../lib/api/videos.ts";
import { AbortedError } from "../../../lib/browser/http.ts";
import { probeVideoResolution } from "../../../lib/media/probe.ts";
import { videoKeys } from "../../videos/hooks/useVideos.ts";
import {
  uploadVideo,
  type UploadHandle,
} from "../services/multipartUpload.ts";

export type UploadPhase =
  | "idle"
  | "probing"
  | "uploading"
  | "completing"
  | "done"
  | "cancelled"
  | "error";

export interface UploadState {
  phase: UploadPhase;
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  videoId?: string;
  errorMessage?: string;
}

const INITIAL_STATE: UploadState = {
  phase: "idle",
  percent: 0,
  loadedBytes: 0,
  totalBytes: 0,
};

export function useVideoUpload() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<UploadState>(INITIAL_STATE);
  const controllerRef = useRef<AbortController | null>(null);
  const handleRef = useRef<UploadHandle | null>(null);
  const videoIdRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    controllerRef.current = null;
    handleRef.current = null;
    videoIdRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const start = useCallback(
    async (file: File, title: string): Promise<VideoDto | null> => {
      const controller = new AbortController();
      controllerRef.current = controller;
      handleRef.current = null;
      videoIdRef.current = null;

      setState({
        phase: "probing",
        percent: 0,
        loadedBytes: 0,
        totalBytes: file.size,
      });

      try {
        // ブラウザ側で元動画の解像度を取得する（取得できなければ null）
        const resolution = await probeVideoResolution(file);

        setState((current) => ({ ...current, phase: "uploading" }));

        const video = await uploadVideo(
          { file, title, resolution },
          {
            onVideoCreated: (videoId) => {
              videoIdRef.current = videoId;
              setState((current) => ({ ...current, videoId }));
            },
            onUploadCreated: (handle) => {
              handleRef.current = handle;
            },
            onProgress: ({ percent, loadedBytes, totalBytes }) => {
              setState((current) =>
                current.phase === "uploading"
                  ? { ...current, percent, loadedBytes, totalBytes }
                  : current,
              );
            },
          },
          controller.signal,
        );

        setState((current) => ({ ...current, phase: "done", percent: 100 }));
        void queryClient.invalidateQueries({ queryKey: videoKeys.all });
        return video;
      } catch (error) {
        if (error instanceof AbortedError) {
          setState((current) => ({ ...current, phase: "cancelled" }));
          return null;
        }
        setState((current) => ({
          ...current,
          phase: "error",
          errorMessage:
            error instanceof Error ? error.message : "アップロードに失敗しました",
        }));
        return null;
      } finally {
        controllerRef.current = null;
      }
    },
    [queryClient],
  );

  /**
   * 明示的な中止。
   * Multipart Upload を破棄し、動画レコードも削除する。
   */
  const cancel = useCallback(async () => {
    controllerRef.current?.abort();

    const handle = handleRef.current;
    const videoId = videoIdRef.current;
    try {
      if (handle !== null) {
        await uploadsApi.abortUpload(handle.videoId, handle.uploadId);
      } else if (videoId !== null) {
        await videosApi.deleteVideo(videoId);
      }
    } catch {
      // 破棄に失敗しても、未完了 Multipart Upload は S3 のライフサイクルで回収される
    } finally {
      handleRef.current = null;
      videoIdRef.current = null;
      setState((current) => ({ ...current, phase: "cancelled" }));
      void queryClient.invalidateQueries({ queryKey: videoKeys.all });
    }
  }, [queryClient]);

  return { state, start, cancel, reset };
}
