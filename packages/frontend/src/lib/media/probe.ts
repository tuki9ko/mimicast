/**
 * 元動画のメタデータ取得（FR-013 / 設計 3.7）。
 *
 * HTMLVideoElement の videoWidth / videoHeight を loadedmetadata で取得する。
 * ブラウザが対応していないコーデック（MKV / MXF など）では取得できないため、
 * その場合は null を返し、サーバー側の既定動作（1080p へ収める）に委ねる。
 *
 * フレームレートはブラウザから正確に取得できないため扱わない。
 */

export interface VideoResolution {
  width: number;
  height: number;
}

const PROBE_TIMEOUT_MS = 10_000;

export function probeVideoResolution(
  file: Blob,
): Promise<VideoResolution | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    const finish = (result: VideoResolution | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);

    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const { videoWidth, videoHeight } = video;
      finish(
        videoWidth > 0 && videoHeight > 0
          ? { width: videoWidth, height: videoHeight }
          : null,
      );
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}
