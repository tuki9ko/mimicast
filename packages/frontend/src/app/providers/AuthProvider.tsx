/**
 * 認証状態の提供。
 *
 * Cognito SDK への依存は lib/auth 側にあり、ここでは AuthClient のみを扱う。
 */

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { setAuthTokenProvider } from "../../lib/api/client.ts";
import { cognitoAuthClient } from "../../lib/auth/cognitoAuthClient.ts";
import type {
  AuthClient,
  AuthUser,
  LoginResult,
} from "../../lib/auth/types.ts";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login(username: string, password: string): Promise<LoginResult>;
  /** 続けて MFA 登録を求められることがあるため結果を返す */
  completeNewPassword(newPassword: string): Promise<LoginResult>;
  completeMfaSetup(totpCode: string): Promise<void>;
  submitTotpCode(totpCode: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  /** テストや将来の実装差し替え用 */
  client?: AuthClient;
}

export function AuthProvider({
  children,
  client = cognitoAuthClient,
}: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    // API クライアントへトークン取得方法を注入する
    setAuthTokenProvider(() => client.getIdToken());

    let cancelled = false;
    void client.getCurrentUser().then((current) => {
      if (cancelled) return;
      setUser(current);
      setStatus(current === null ? "unauthenticated" : "authenticated");
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const applySignIn = useCallback((result: LoginResult): LoginResult => {
    if (result.kind === "SIGNED_IN") {
      setUser(result.user);
      setStatus("authenticated");
    }
    return result;
  }, []);

  const login = useCallback(
    async (username: string, password: string) =>
      applySignIn(await client.login(username, password)),
    [client, applySignIn],
  );

  const completeNewPassword = useCallback(
    async (newPassword: string) =>
      applySignIn(await client.completeNewPassword(newPassword)),
    [client, applySignIn],
  );

  const completeMfaSetup = useCallback(
    async (totpCode: string) => {
      applySignIn(await client.completeMfaSetup(totpCode));
    },
    [client, applySignIn],
  );

  const submitTotpCode = useCallback(
    async (totpCode: string) => {
      applySignIn(await client.submitTotpCode(totpCode));
    },
    [client, applySignIn],
  );

  const logout = useCallback(async () => {
    await client.logout();
    setUser(null);
    setStatus("unauthenticated");
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      completeNewPassword,
      completeMfaSetup,
      submitTotpCode,
      logout,
    }),
    [
      status,
      user,
      login,
      completeNewPassword,
      completeMfaSetup,
      submitTotpCode,
      logout,
    ],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (value === null) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
