import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/Button.tsx";
import { Notice } from "../components/Notice.tsx";
import { useAuth } from "../app/providers/AuthProvider.tsx";

export function LoginPage() {
  const { status, login, completeNewPassword } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [needsNewPassword, setNeedsNewPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "authenticated") void navigate("/", { replace: true });
  }, [status, navigate]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await login(username, password);
      if (result.kind === "NEW_PASSWORD_REQUIRED") {
        setNeedsNewPassword(true);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "ログインに失敗しました",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleNewPassword = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrorMessage(null);
    try {
      await completeNewPassword(newPassword);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "パスワードの変更に失敗しました",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="centered">
      <div className="card login">
        <h1 className="login__title">mimicast</h1>
        <p className="login__subtitle">管理画面</p>

        {errorMessage !== null && (
          <Notice tone="error">{errorMessage}</Notice>
        )}

        {needsNewPassword ? (
          <form onSubmit={(event) => void handleNewPassword(event)}>
            <Notice tone="info">
              初回ログインのため、新しいパスワードを設定してください。
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
        ) : (
          <form onSubmit={(event) => void handleLogin(event)}>
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
      </div>
    </div>
  );
}
