"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { WarningCircle, XCircle } from "@phosphor-icons/react";

interface ToastItem {
  id: number;
  message: string;
  variant: "error" | "warning";
}

interface ToastContextValue {
  push: (message: string, variant?: ToastItem["variant"]) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback((message: string, variant: ToastItem["variant"] = "error") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="region" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-start gap-2 rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm shadow-lg shadow-black/5"
            style={{ color: "var(--ink)" }}
          >
            {t.variant === "error" ? (
              <XCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-danger" />
            ) : (
              <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" style={{ color: "var(--priority-medium)" }} />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
