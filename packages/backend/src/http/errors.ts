/**
 * API のエラー表現。設計 8.1 のエラーレスポンス形式に対応する。
 */

import type { ApiErrorCode } from "@mimicast/shared";

export class AppError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

/** 400: 入力値が不正 */
export const validationError = (message: string): AppError =>
  new AppError(400, "VALIDATION_ERROR", message);

/** 401: 未認証 */
export const unauthorized = (message = "unauthorized"): AppError =>
  new AppError(401, "UNAUTHORIZED", message);

/** 404: 対象が存在しない */
export const notFound = (message = "not found"): AppError =>
  new AppError(404, "NOT_FOUND", message);

/** 409: 現在の状態がその操作を許可しない */
export const conflict = (message: string): AppError =>
  new AppError(409, "CONFLICT", message);

/** 500: サーバーエラー */
export const internalError = (message = "internal server error"): AppError =>
  new AppError(500, "INTERNAL_ERROR", message);
