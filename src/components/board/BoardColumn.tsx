"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, Trash } from "@phosphor-icons/react";
import { IconButton } from "@/components/ui/Button";
import { IssueCard } from "./IssueCard";
import type { CardT, ListT, MemberOption } from "./types";

export function BoardColumn({
  list,
  cards,
  members,
  onAddCard,
  onDeleteList,
  onOpenCard,
}: {
  list: ListT;
  cards: CardT[];
  members: MemberOption[];
  onAddCard: () => void;
  onDeleteList: () => void;
  onOpenCard: (card: CardT) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: list.id });
  const memberById = Object.fromEntries(members.map((m) => [m.id, m.name]));

  return (
    <div className="flex h-full w-72 shrink-0 flex-col rounded-md bg-surface-sunken">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-medium text-ink">{list.name}</h3>
          <span className="text-xs text-ink-faint">{cards.length}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton aria-label={`Add card to ${list.name}`} onClick={onAddCard}>
            <Plus size={16} />
          </IconButton>
          {cards.length === 0 && (
            <IconButton aria-label={`Delete ${list.name}`} onClick={onDeleteList}>
              <Trash size={16} />
            </IconButton>
          )}
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[60px] flex-1 flex-col gap-2 overflow-y-auto rounded-md p-2 pt-0 transition-colors ${
          isOver ? "bg-surface" : ""
        }`}
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <IssueCard
              key={card.id}
              card={card}
              assigneeName={card.assigneeId ? memberById[card.assigneeId] : undefined}
              onOpen={() => onOpenCard(card)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
