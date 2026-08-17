/**
 * レスポンス生成。
 *
 * CORS ヘッダは API Gateway HTTP API の CORS 設定が付与するため、
 * Lambda 側では付けない（重複すると invalid になる）。
 */

import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { ApiErrorBody } from "@mimicast/shared";

import { AppError } from "./errors.ts";
import { logger, toErrorFields } from "../logging/logger.ts";

export interface HttpResult {
  status: number;
  body?: unknown;
}

export const okResult = (body: unknown): HttpResult => ({ status: 200, body });
export const createdResult = (body: unknown): HttpResult => ({
  status: 201,
  body,
});
export const noContentResult = (): HttpResult => ({ status: 204 });

export function toApiGatewayResult(
  result: HttpResult,
): APIGatewayProxyStructuredResultV2 {
  if (result.body === undefined) {
    return { statusCode: result.status };
  }
  return {
    statusCode: result.status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result.body),
  };
}

/** 例外をレスポンスへ変換する。想定外の例外の詳細はクライアントへ返さない。 */
export function toErrorResult(
  error: unknown,
  requestId: string,
): APIGatewayProxyStructuredResultV2 {
  if (error instanceof AppError) {
    if (error.status >= 500) {
      logger.error("request failed", { requestId, code: error.code, ...toErrorFields(error) });
    } else {
      logger.warn("request rejected", {
        requestId,
        code: error.code,
        status: error.status,
        detail: error.message,
      });
    }
    const body: ApiErrorBody = {
      error: { code: error.code, message: error.message },
    };
    return toApiGatewayResult({ status: error.status, body });
  }

  logger.error("unhandled error", { requestId, ...toErrorFields(error) });
  const body: ApiErrorBody = {
    error: { code: "INTERNAL_ERROR", message: "internal server error" },
  };
  return toApiGatewayResult({ status: 500, body });
}
