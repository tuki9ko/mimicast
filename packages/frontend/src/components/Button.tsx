import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

export function Button({
  variant = "secondary",
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const classes = ["button", `button--${variant}`, className]
    .filter((value) => value !== undefined && value !== "")
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
