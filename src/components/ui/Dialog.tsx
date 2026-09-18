"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import { IconButton } from "./Button";

// Native <dialog> so the overlay escapes any ancestor's overflow/stacking
// context instead of relying on a hand-rolled fixed-position portal.
export function Dialog({
  open,
  onClose,
  title,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      className={`w-full ${wide ? "max-w-xl" : "max-w-md"} rounded-md border border-border bg-surface-raised p-0 text-ink shadow-xl backdrop:bg-black/60`}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <IconButton aria-label="Close" onClick={onClose}>
          <X size={16} weight="bold" />
        </IconButton>
      </div>
      <div className="max-h-[80vh] overflow-y-auto p-4">{children}</div>
    </dialog>
  );
}
