import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { Spinner } from "../components/Spinner.tsx";
import { useAuth } from "./providers/AuthProvider.tsx";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="centered">
        <Spinner label="読み込み中" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
