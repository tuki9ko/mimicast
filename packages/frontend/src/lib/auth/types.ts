/**
 * 認証の抽象インターフェース。
 *
 * React コンポーネントは Cognito SDK ではなくこのインターフェースだけを利用する。
 * Astro 等へ移行した場合も、この実装はそのまま再利用できる。
 */

export interface AuthUser {
  username: string;
  email?: string;
}

/** パスワード変更が必要な場合に返る状態（管理者が作成した直後のユーザー）。 */
export interface NewPasswordRequired {
  kind: "NEW_PASSWORD_REQUIRED";
}

export interface SignedIn {
  kind: "SIGNED_IN";
  user: AuthUser;
}

export type LoginResult = SignedIn | NewPasswordRequired;

export interface AuthClient {
  login(username: string, password: string): Promise<LoginResult>;
  /** NEW_PASSWORD_REQUIRED の後に呼ぶ */
  completeNewPassword(newPassword: string): Promise<SignedIn>;
  logout(): Promise<void>;
  /** 現在のユーザー。未ログインなら null */
  getCurrentUser(): Promise<AuthUser | null>;
  /**
   * API 呼び出しに使うトークン。
   * ID Token を利用する（Authorizer の audience 検証に合わせるため）。
   */
  getIdToken(): Promise<string | null>;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
