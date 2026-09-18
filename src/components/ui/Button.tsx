"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { CircleNotch } from "@phosphor-icons/react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-sm px-3.5 py-2 text-sm font-medium " +
  "transition-[transform,background-color,border-color,color] duration-150 " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "border border-border-strong bg-surface-raised text-ink hover:bg-surface-sunken",
  ghost: "text-ink-muted hover:bg-surface-sunken hover:text-ink",
  danger: "bg-danger text-danger-fg hover:opacity-90",
};

export function Button({
  variant = "secondary",
  loading = false,
  icon,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <CircleNotch size={16} weight="bold" className="animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

export function IconButton({
  variant = "ghost",
  loading = false,
  "aria-label": ariaLabel,
  className = "",
  children,
  ...rest
}: ButtonProps & { "aria-label": string }) {
  return (
    <button
      aria-label={ariaLabel}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
      disabled={loading}
      {...rest}
    >
      {loading ? <CircleNotch size={16} weight="bold" className="animate-spin" /> : children}
    </button>
  );
}
