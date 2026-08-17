/**
 * API クライアント（設計 3.5）。
 *
 * UI コンポーネントから fetch を直接呼ばない。
 * API のベース URL は lib/config.ts からのみ取得する。
 */

import type { ApiErrorBody } from "@mimicast/shared";

import { config } from "../config.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type TokenProvider = () => Promise<string | null>;

let tokenProvider: TokenProvider = async () => null;

/** 認証層からトークン取得方法を注入する（UI からは呼ばない）。 */
export function setAuthTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

interface RequestOptions {
  signal?: AbortSignal;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";

  const token = await tokenProvider();
  if (token !== null) headers["authorization"] = `Bearer ${token}`;

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  const text = await response.text();
  const payload: unknown = text === "" ? undefined : safeParse(text);

  if (!response.ok) {
    throw toApiError(response.status, payload);
  }
  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function toApiError(status: number, payload: unknown): ApiError {
  const body = payload as ApiErrorBody | undefined;
  const code = body?.error?.code ?? "UNKNOWN";
  const message = body?.error?.message ?? `request failed with status ${status}`;
  return new ApiError(status, code, message);
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PATCH", path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>("DELETE", path, undefined, options),
};
