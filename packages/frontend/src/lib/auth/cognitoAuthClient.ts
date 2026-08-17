/**
 * Cognito User Pool を使った AuthClient 実装。
 *
 * Cognito SDK への依存はこのファイルへ閉じ込める（設計 3.11 / 制約 29）。
 * セッション（トークン）の保管は SDK が localStorage で行う。
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

/** newPasswordRequired チャレンジの継続用に保持する。 */
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
        },
      );
    });
  },

  completeNewPassword(newPassword) {
    const user = challengedUser;
    if (user === null) {
      return Promise.reject(new AuthError("パスワード変更の対象がありません"));
    }
    return new Promise<SignedIn>((resolve, reject) => {
      user.completeNewPasswordChallenge(
        newPassword,
        {},
        {
          onSuccess: (session) => {
            challengedUser = null;
            resolve({ kind: "SIGNED_IN", user: toAuthUser(user, session) });
          },
          onFailure: (error) => reject(toAuthError(error)),
        },
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
