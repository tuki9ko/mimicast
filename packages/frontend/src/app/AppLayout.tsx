/**
 * 管理画面のシェル。ルーティング依存は app / pages 層に限定する。
 */

import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { Button } from "../components/Button.tsx";
import { useAuth } from "./providers/AuthProvider.tsx";

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    void navigate("/login", { replace: true });
  };

  return (
    <div className="layout">
      <header className="layout__header">
        <div className="layout__brand">
          <span className="layout__logo">mimicast</span>
          <span className="layout__subtitle">VRChat 動画配信管理</span>
        </div>

        <nav className="layout__nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? "layout__link layout__link--active" : "layout__link"
            }
          >
            動画一覧
          </NavLink>
          <NavLink
            to="/upload"
            className={({ isActive }) =>
              isActive ? "layout__link layout__link--active" : "layout__link"
            }
          >
            アップロード
          </NavLink>
        </nav>

        <div className="layout__user">
          <span className="layout__username">{user?.email ?? user?.username}</span>
          <Button variant="ghost" onClick={() => void handleLogout()}>
            ログアウト
          </Button>
        </div>
      </header>

      <main className="layout__main">
        <Outlet />
      </main>
    </div>
  );
}
