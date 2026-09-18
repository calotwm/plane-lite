"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarBlank } from "@phosphor-icons/react";
import { Avatar } from "@/components/ui/Avatar";
import { PriorityBadge } from "@/components/ui/Badge";
import type { CardT } from "./types";

export function IssueCard({
  card,
  assigneeName,
  onOpen,
}: {
  card: CardT;
  assigneeName?: string;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className="flex w-full flex-col gap-2 rounded-md border border-border bg-surface-raised p-3 text-left transition-colors hover:border-border-strong"
    >
      <p className="text-sm font-medium leading-snug text-ink">{card.title}</p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PriorityBadge priority={card.priority} />
          {card.dueDate && (
            <span className="flex items-center gap-1 text-xs text-ink-muted">
              <CalendarBlank size={12} />
              {new Date(card.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
        {assigneeName && <Avatar name={assigneeName} size={20} />}
      </div>
    </button>
  );
}
