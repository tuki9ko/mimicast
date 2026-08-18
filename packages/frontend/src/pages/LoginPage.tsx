import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/Button.tsx";
import { Notice } from "../components/Notice.tsx";
import { useAuth } from "../app/providers/AuthProvider.tsx";
import { copyToClipboard } from "../lib/browser/clipboard.ts";
import type { LoginResult } from "../lib/auth/types.ts";

type Step = "password" | "newPassword" | "mfaSetup" | "totp";

export function LoginPage() {
  const { status, login, completeNewPassword, completeMfaSetup, submitTotpCode } =
    useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status === "authenticated") void navigate("/", { replace: true });
  }, [status, navigate]);

  /** 次に必要な入力へ進む。 */
  const advance = (result: LoginResult) => {
    switch (result.kind) {
      case "SIGNED_IN":
        return;
      case "NEW_PASSWORD_REQUIRED":
        setStep("newPassword");
        return;
      case "MFA_SETUP_REQUIRED":
        setMfaSecret(result.secretCode);
        setStep("mfaSetup");
        return;
      case "TOTP_REQUIRED":
        setStep("totp");
        return;
    }
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setErrorMessage(null);
    try {
      await action();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "認証に失敗しました",
      );
    } finally {
      setBusy(false);
    }
  };

  const onSubmitPassword = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => advance(await login(username, password)));
  };

  const onSubmitNewPassword = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => advance(await completeNewPassword(newPassword)));
  };

  const onSubmitMfaSetup = (event: FormEvent) => {
    event.preventDefault();
    void run(() => completeMfaSetup(totpCode.trim()));
  };

  const onSubmitTotp = (event: FormEvent) => {
    event.preventDefault();
    void run(() => submitTotpCode(totpCode.trim()));
  };

  const handleCopySecret = async () => {
    if (mfaSecret === null) return;
    await copyToClipboard(mfaSecret);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="centered">
      <div className="card login">
        <h1 className="login__title">mimicast</h1>
        <p className="login__subtitle">管理画面</p>

        {errorMessage !== null && <Notice tone="error">{errorMessage}</Notice>}

        {step === "password" && (
          <form onSubmit={onSubmitPassword}>
            <label className="field">
              <span className="field__label">ユーザー名</span>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field__label">パスワード</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "ログイン中..." : "ログイン"}
            </Button>
          </form>
        )}

        {step === "newPassword" && (
          <form onSubmit={onSubmitNewPassword}>
            <Notice tone="info">
              初回ログインのため、新しいパスワードを設定してください。
              12 文字以上で、大文字・小文字・数字・記号をすべて含めてください。
            </Notice>
            <label className="field">
              <span className="field__label">新しいパスワード</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </label>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "設定中..." : "パスワードを設定"}
            </Button>
          </form>
        )}

        {step === "mfaSetup" && (
          <form onSubmit={onSubmitMfaSetup}>
            <Notice tone="info" title="認証アプリを登録してください">
              認証アプリ（Google Authenticator、1Password など）に以下のキーを
              登録し、表示された 6 桁のコードを入力してください。
            </Notice>

            <label className="field">
              <span className="field__label">セットアップキー</span>
              <textarea
                className="mfa-secret"
                readOnly
                rows={2}
                value={mfaSecret ?? ""}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            <Button variant="secondary" onClick={() => void handleCopySecret()}>
              {copied ? "コピーしました" : "キーをコピー"}
            </Button>

            <label className="field">
              <span className="field__label">認証コード（6 桁）</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
                required
              />
            </label>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "確認中..." : "登録してログイン"}
            </Button>
          </form>
        )}

        {step === "totp" && (
          <form onSubmit={onSubmitTotp}>
            <label className="field">
              <span className="field__label">認証コード（6 桁）</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
                required
                autoFocus
              />
            </label>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "確認中..." : "ログイン"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
