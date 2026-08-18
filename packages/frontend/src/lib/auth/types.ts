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

/**
 * 認証アプリの登録が必要な場合に返る状態。
 *
 * MFA を必須にしているため、初回ログイン時にここを通る。
 */
export interface MfaSetupRequired {
  kind: "MFA_SETUP_REQUIRED";
  /** 認証アプリへ手入力するシークレット */
  secretCode: string;
  /** 認証アプリで読み取れる otpauth URI */
  otpauthUri: string;
}

/** 登録済みの認証アプリのコード入力が必要な状態（2 回目以降のログイン）。 */
export interface TotpRequired {
  kind: "TOTP_REQUIRED";
}

export interface SignedIn {
  kind: "SIGNED_IN";
  user: AuthUser;
}

export type LoginResult =
  | SignedIn
  | NewPasswordRequired
  | MfaSetupRequired
  | TotpRequired;

export interface AuthClient {
  login(username: string, password: string): Promise<LoginResult>;
  /** NEW_PASSWORD_REQUIRED の後に呼ぶ。続けて MFA 登録を求められることがある */
  completeNewPassword(newPassword: string): Promise<LoginResult>;
  /** MFA_SETUP_REQUIRED の後に呼ぶ。認証アプリが表示する 6 桁を渡す */
  completeMfaSetup(totpCode: string): Promise<SignedIn>;
  /** TOTP_REQUIRED の後に呼ぶ */
  submitTotpCode(totpCode: string): Promise<SignedIn>;
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
