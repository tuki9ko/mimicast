/**
 * Cognito User Pool を使った AuthClient 実装。
 *
 * Cognito SDK への依存はこのファイルへ閉じ込める。
 * セッション（トークン）の保管は SDK が localStorage で行う。
 *
 * MFA を必須にしているため、ログインは以下のいずれかの経路を通る。
 *   初回      : パスワード -> 新パスワード設定 -> 認証アプリ登録
 *   2 回目以降 : パスワード -> 認証アプリのコード入力
 */

import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
} from "amazon-cognito-identity-js";

import { config } from "../config.ts";
import {
  AuthError,
  type AuthClient,
  type AuthUser,
  type LoginResult,
  type SignedIn,
} from "./types.ts";

const userPool = new CognitoUserPool({
  UserPoolId: config.cognito.userPoolId,
  ClientId: config.cognito.clientId,
});

/** 認証アプリに表示される発行者名。 */
const TOTP_ISSUER = "mimicast";

/** チャレンジ（新パスワード / MFA）の継続用に保持する。 */
let challengedUser: CognitoUser | null = null;

function toAuthUser(user: CognitoUser, session: CognitoUserSession): AuthUser {
  const payload = session.getIdToken().decodePayload();
  const email = typeof payload["email"] === "string" ? payload["email"] : undefined;
  return email === undefined
    ? { username: user.getUsername() }
    : { username: user.getUsername(), email };
}

function toAuthError(error: unknown): AuthError {
  if (error instanceof Error) {
    switch (error.name) {
      case "NotAuthorizedException":
        return new AuthError("ユーザー名またはパスワードが違います");
      case "UserNotFoundException":
        return new AuthError("ユーザーが見つかりません");
      case "PasswordResetRequiredException":
        return new AuthError("パスワードの再設定が必要です");
      case "InvalidPasswordException":
        return new AuthError("パスワードがポリシーを満たしていません");
      case "EnableSoftwareTokenMFAException":
      case "CodeMismatchException":
        return new AuthError("認証コードが違います");
      case "ExpiredCodeException":
        return new AuthError("認証コードの有効期限が切れています");
      default:
        return new AuthError(error.message);
    }
  }
  return new AuthError("認証に失敗しました");
}

function getSession(user: CognitoUser): Promise<CognitoUserSession | null> {
  return new Promise((resolve) => {
    // 有効期限が切れている場合、SDK が refresh token で自動更新する
    user.getSession((error: Error | null, session: CognitoUserSession | null) => {
      if (error !== null || session === null || !session.isValid()) {
        resolve(null);
        return;
      }
      resolve(session);
    });
  });
}

function otpauthUri(username: string, secretCode: string): string {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${username}`);
  const params = new URLSearchParams({
    secret: secretCode,
    issuer: TOTP_ISSUER,
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * 認証アプリの登録チャレンジ。シークレットを受け取って呼び出し側へ渡す。
 */
function beginMfaSetup(
  user: CognitoUser,
  username: string,
  resolve: (result: LoginResult) => void,
  reject: (error: AuthError) => void,
): void {
  challengedUser = user;
  user.associateSoftwareToken({
    associateSecretCode: (secretCode) => {
      resolve({
        kind: "MFA_SETUP_REQUIRED",
        secretCode,
        otpauthUri: otpauthUri(username, secretCode),
      });
    },
    onFailure: (error) => reject(toAuthError(error)),
  });
}

function requireChallengedUser(): CognitoUser {
  if (challengedUser === null) {
    throw new AuthError("認証の途中状態が失われています。もう一度ログインしてください");
  }
  return challengedUser;
}

export const cognitoAuthClient: AuthClient = {
  login(username, password) {
    return new Promise<LoginResult>((resolve, reject) => {
      const user = new CognitoUser({ Username: username, Pool: userPool });
      user.authenticateUser(
        new AuthenticationDetails({ Username: username, Password: password }),
        {
          onSuccess: (session) => {
            challengedUser = null;
            resolve({ kind: "SIGNED_IN", user: toAuthUser(user, session) });
          },
          onFailure: (error) => {
            challengedUser = null;
            reject(toAuthError(error));
          },
          newPasswordRequired: () => {
            // 管理者が作成した直後のユーザーはパスワード変更が必要
            challengedUser = user;
            resolve({ kind: "NEW_PASSWORD_REQUIRED" });
          },
          mfaSetup: () => beginMfaSetup(user, username, resolve, reject),
          totpRequired: () => {
            challengedUser = user;
            resolve({ kind: "TOTP_REQUIRED" });
          },
        },
      );
    });
  },

  completeNewPassword(newPassword) {
    let user: CognitoUser;
    try {
      user = requireChallengedUser();
    } catch (error) {
      return Promise.reject(error as AuthError);
    }
    const username = user.getUsername();

    return new Promise<LoginResult>((resolve, reject) => {
      user.completeNewPasswordChallenge(
        newPassword,
        {},
        {
          onSuccess: (session) => {
            challengedUser = null;
            resolve({ kind: "SIGNED_IN", user: toAuthUser(user, session) });
          },
          onFailure: (error) => reject(toAuthError(error)),
          // パスワード設定の直後に認証アプリの登録を求められる
          mfaSetup: () => beginMfaSetup(user, username, resolve, reject),
          totpRequired: () => {
            challengedUser = user;
            resolve({ kind: "TOTP_REQUIRED" });
          },
        },
      );
    });
  },

  completeMfaSetup(totpCode) {
    let user: CognitoUser;
    try {
      user = requireChallengedUser();
    } catch (error) {
      return Promise.reject(error as AuthError);
    }

    return new Promise<SignedIn>((resolve, reject) => {
      user.verifySoftwareToken(totpCode, TOTP_ISSUER, {
        onSuccess: (session) => {
          challengedUser = null;
          resolve({ kind: "SIGNED_IN", user: toAuthUser(user, session) });
        },
        onFailure: (error) => reject(toAuthError(error)),
      });
    });
  },

  submitTotpCode(totpCode) {
    let user: CognitoUser;
    try {
      user = requireChallengedUser();
    } catch (error) {
      return Promise.reject(error as AuthError);
    }

    return new Promise<SignedIn>((resolve, reject) => {
      user.sendMFACode(
        totpCode,
        {
          onSuccess: (session) => {
            challengedUser = null;
            resolve({ kind: "SIGNED_IN", user: toAuthUser(user, session) });
          },
          onFailure: (error) => reject(toAuthError(error)),
        },
        "SOFTWARE_TOKEN_MFA",
      );
    });
  },

  async logout() {
    challengedUser = null;
    const user = userPool.getCurrentUser();
    if (user === null) return;
    await new Promise<void>((resolve) => {
      user.signOut(() => resolve());
    });
  },

  async getCurrentUser() {
    const user = userPool.getCurrentUser();
    if (user === null) return null;
    const session = await getSession(user);
    return session === null ? null : toAuthUser(user, session);
  },

  async getIdToken() {
    const user = userPool.getCurrentUser();
    if (user === null) return null;
    const session = await getSession(user);
    return session === null ? null : session.getIdToken().getJwtToken();
  },
};
