/**
 * API Gateway HTTP API (payload format 2.0) のイベントを、
 * ルートハンドラが扱いやすい形へ正規化する。
 */

import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

import { unauthorized, validationError } from "./errors.ts";

export interface RequestContext {
  /** 例: "POST /videos/{id}/uploads" */
  routeKey: string;
  pathParameters: Record<string, string | undefined>;
  queryStringParameters: Record<string, string | undefined>;
  /** JSON パース済みのリクエストボディ。ボディがない場合は undefined */
  body: unknown;
  /** Cognito JWT の sub */
  userId: string;
  requestId: string;
}

/** 本文を JSON として解釈する。空ボディは undefined。 */
export function parseJsonBody(event: {
  body?: string | undefined;
  isBase64Encoded?: boolean | undefined;
}): unknown {
  if (event.body === undefined || event.body === "") return undefined;
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw validationError("request body must be valid JSON");
  }
}

/**
 * JWT Authorizer が検証済みのクレームから sub を取り出す。
 *
 * 認証自体は API Gateway の JWT Authorizer が行うが、
 * 設定ミスで Authorizer が外れた場合に無防備にならないよう Lambda 側でも確認する。
 */
export function extractUserId(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): string {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  const sub = claims?.["sub"];
  if (typeof sub !== "string" || sub === "") {
    throw unauthorized();
  }
  return sub;
}

export function toRequestContext(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): RequestContext {
  return {
    routeKey: event.routeKey,
    pathParameters: event.pathParameters ?? {},
    queryStringParameters: event.queryStringParameters ?? {},
    body: parseJsonBody(event),
    userId: extractUserId(event),
    requestId: event.requestContext.requestId,
  };
}

/** 必須のパスパラメータを取り出す。 */
export function requirePathParam(ctx: RequestContext, name: string): string {
  const value = ctx.pathParameters[name];
  if (value === undefined || value === "") {
    throw validationError(`path parameter ${name} is required`);
  }
  return value;
}
