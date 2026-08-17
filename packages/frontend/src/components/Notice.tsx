import type { ReactNode } from "react";

export type NoticeTone = "info" | "warning" | "error";

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`notice notice--${tone}`}>
      {title !== undefined && <p className="notice__title">{title}</p>}
      <div className="notice__body">{children}</div>
    </div>
  );
}
