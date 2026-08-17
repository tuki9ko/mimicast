/**
 * 進捗を取得できる PUT。
 *
 * fetch はアップロード進捗を取得できないため XMLHttpRequest を使う。
 * Browser API への依存はこのモジュールへ隔離する。
 */

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export class AbortedError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortedError";
  }
}

export interface PutWithProgressOptions {
  url: string;
  body: Blob;
  signal?: AbortSignal;
  /** 送信済みバイト数 */
  onProgress?: (loaded: number) => void;
}

export interface PutWithProgressResult {
  /** S3 の Multipart 完了処理に必要。CORS の ExposeHeaders に ETag が必要 */
  etag: string;
}

export function putWithProgress(
  options: PutWithProgressOptions,
): Promise<PutWithProgressResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted === true) {
      reject(new AbortedError());
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", options.url, true);

    const onAbort = () => xhr.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const cleanup = () => {
      options.signal?.removeEventListener("abort", onAbort);
    };

    xhr.upload.onprogress = (event) => {
      options.onProgress?.(event.loaded);
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new HttpError(xhr.status, `upload failed (${xhr.status})`));
        return;
      }
      const etag = xhr.getResponseHeader("ETag");
      if (etag === null) {
        // S3 の CORS 設定で ExposeHeaders: ["ETag"] が漏れている
        reject(
          new HttpError(
            xhr.status,
            "ETag ヘッダを取得できません（S3 CORS の ExposeHeaders を確認してください）",
          ),
        );
        return;
      }
      resolve({ etag });
    };

    xhr.onerror = () => {
      cleanup();
      reject(new HttpError(0, "network error"));
    };

    xhr.onabort = () => {
      cleanup();
      reject(new AbortedError());
    };

    xhr.send(options.body);
  });
}
