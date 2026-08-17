/**
 * API Lambda のエントリポイント。
 *
 * 認証は API Gateway の JWT Authorizer が行う（設計 17 章）。
 * ここでは routeKey に対応するハンドラへ振り分けるだけとする。
 */

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

import { createDependencies, type Dependencies } from "../deps.ts";
import { notFound } from "../http/errors.ts";
import { toRequestContext } from "../http/request.ts";
import { toApiGatewayResult, toErrorResult } from "../http/response.ts";
import { routes } from "../routes/index.ts";

// 実行環境の再利用時に初期化コストを払わないよう、グローバルスコープで保持する。
let dependencies: Dependencies | undefined;

function getDependencies(): Dependencies {
  dependencies ??= createDependencies();
  return dependencies;
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  const requestId = event.requestContext?.requestId ?? "-";
  try {
    const ctx = toRequestContext(event);
    const route = routes[ctx.routeKey];
    if (route === undefined) throw notFound("route not found");
    return toApiGatewayResult(await route(ctx, getDependencies()));
  } catch (error) {
    return toErrorResult(error, requestId);
  }
}
