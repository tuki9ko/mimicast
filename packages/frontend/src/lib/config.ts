/**
 * Vite 固有の環境変数参照はこのモジュールへ集約する（設計 3.11）。
 *
 * import.meta.env を各所から直接参照しないこと。
 * ここに書いた値はビルド成果物へ埋め込まれるため、秘密情報を置いてはならない。
 */

export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
}

export interface AppConfig {
  apiBaseUrl: string;
  cognito: CognitoConfig;
}

function required(name: string, value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new Error(`environment variable ${name} is not set`);
  }
  return value.replace(/\/$/, "");
}

export const config: AppConfig = {
  apiBaseUrl: required("VITE_API_BASE_URL", import.meta.env.VITE_API_BASE_URL),
  cognito: {
    region: required("VITE_COGNITO_REGION", import.meta.env.VITE_COGNITO_REGION),
    userPoolId: required(
      "VITE_COGNITO_USER_POOL_ID",
      import.meta.env.VITE_COGNITO_USER_POOL_ID,
    ),
    clientId: required(
      "VITE_COGNITO_CLIENT_ID",
      import.meta.env.VITE_COGNITO_CLIENT_ID,
    ),
  },
};
