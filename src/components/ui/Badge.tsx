const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const PRIORITY_VAR: Record<string, string> = {
  LOW: "var(--priority-low)",
  MEDIUM: "var(--priority-medium)",
  HIGH: "var(--priority-high)",
};

export function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_VAR[priority] ?? PRIORITY_VAR.MEDIUM;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-ink-muted">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {PRIORITY_LABEL[priority] ?? priority}
    </span>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink-muted">
      {children}
    </span>
  );
}
