import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "./Button.tsx";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  confirmLabel = "実行する",
  cancelLabel = "キャンセル",
  busy = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 className="dialog__title">{title}</h2>
      {children !== undefined && <div className="dialog__body">{children}</div>}
      <div className="dialog__actions">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
