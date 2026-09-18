"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Plus } from "@phosphor-icons/react";
import { api, ApiError } from "@/lib/apiClient";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { BoardColumn } from "./BoardColumn";
import { IssueCard } from "./IssueCard";
import { IssueDialog } from "./IssueDialog";
import type { CardT, ListT, MemberOption } from "./types";

export function Board({
  projectId,
  boardId,
  currentUserId,
  isAdmin,
}: {
  projectId: string;
  boardId: string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const toast = useToast();
  const [lists, setLists] = useState<ListT[] | null>(null);
  const [cardsByList, setCardsByList] = useState<Record<string, CardT[]>>({});
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [activeCard, setActiveCard] = useState<CardT | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [dialogState, setDialogState] = useState<{ card: CardT | null; listId: string } | null>(null);

  const snapshotRef = useRef<Record<string, CardT[]>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [listsRes, cardsRes] = await Promise.all([
        api<{ lists: ListT[] }>(`/api/boards/${boardId}/lists`),
        api<{ cards: CardT[] }>(`/api/projects/${projectId}/cards`),
      ]);
      if (cancelled) return;
      const listIds = new Set(listsRes.lists.map((l) => l.id));
      const grouped: Record<string, CardT[]> = {};
      for (const list of listsRes.lists) grouped[list.id] = [];
      for (const card of cardsRes.cards) {
        if (card.listId && listIds.has(card.listId)) {
          grouped[card.listId].push(card);
        }
      }
      setLists(listsRes.lists);
      setCardsByList(grouped);
    }

    load().catch(() => toast.push("Could not load the board."));

    api<{ project: { teamId: string } }>(`/api/projects/${projectId}`)
      .then((data) =>
        api<{ members: { user: { id: string; name: string } }[] }>(
          `/api/teams/${data.project.teamId}/members`,
        ),
      )
      .then((data) => {
        if (!cancelled) setMembers(data.members.map((m) => ({ id: m.user.id, name: m.user.name })));
      })
      .catch(() => {
        // Non-admin callers can't list team members yet (admin-only route);
        // the assignee field just stays hidden in that case.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, projectId]);

  function findContainer(id: string): string | undefined {
    if (lists?.some((l) => l.id === id)) return id;
    return Object.entries(cardsByList).find(([, cards]) => cards.some((c) => c.id === id))?.[0];
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragStart(event: DragStartEvent) {
    snapshotRef.current = cardsByList;
    const containerId = findContainer(event.active.id as string);
    const card = containerId ? cardsByList[containerId].find((c) => c.id === event.active.id) : undefined;
    setActiveCard(card ?? null);
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setCardsByList((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const activeIndex = activeItems.findIndex((c) => c.id === active.id);
      if (activeIndex === -1) return prev;
      const overIndex = overItems.findIndex((c) => c.id === over.id);
      const newIndex = overIndex >= 0 ? overIndex : overItems.length;
      const moved = activeItems[activeIndex];
      return {
        ...prev,
        [activeContainer]: activeItems.filter((c) => c.id !== active.id),
        [overContainer]: [...overItems.slice(0, newIndex), moved, ...overItems.slice(newIndex)],
      };
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;

    const overContainer = findContainer(over.id as string) ?? findContainer(active.id as string);
    if (!overContainer) return;

    setCardsByList((prev) => {
      const items = prev[overContainer];
      const activeIndex = items.findIndex((c) => c.id === active.id);
      const overIndex = items.findIndex((c) => c.id === over.id);
      const reordered =
        overIndex >= 0 && activeIndex !== overIndex ? arrayMove(items, activeIndex, overIndex) : items;
      const finalIndex = reordered.findIndex((c) => c.id === active.id);
      const movedCard = reordered[finalIndex];
      persistMove(movedCard, overContainer, finalIndex);
      return { ...prev, [overContainer]: reordered };
    });
  }

  async function persistMove(card: CardT, targetListId: string, index: number) {
    const previous = snapshotRef.current;
    try {
      const { card: updated } = await api<{ card: CardT }>(`/api/cards/${card.id}/move`, {
        method: "POST",
        body: JSON.stringify({ version: card.version, listId: targetListId, index }),
      });
      setCardsByList((prev) => ({
        ...prev,
        [targetListId]: prev[targetListId].map((c) =>
          c.id === updated.id ? { ...c, version: updated.version, position: updated.position } : c,
        ),
      }));
    } catch (err) {
      setCardsByList(previous);
      toast.push(err instanceof ApiError ? err.message : "Could not move the card.");
    }
  }

  async function createList(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/boards/${boardId}/lists`, { method: "POST", body: JSON.stringify({ name: newListName }) });
      const { lists: refreshed } = await api<{ lists: ListT[] }>(`/api/boards/${boardId}/lists`);
      setLists(refreshed);
      setCardsByList((prev) => {
        const next = { ...prev };
        for (const l of refreshed) if (!(l.id in next)) next[l.id] = [];
        return next;
      });
      setNewListName("");
      setAddingList(false);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Could not create the list.");
    }
  }

  async function deleteList(listId: string) {
    try {
      await api(`/api/lists/${listId}`, { method: "DELETE" });
      setLists((prev) => prev?.filter((l) => l.id !== listId) ?? null);
      setCardsByList((prev) => {
        const { [listId]: _removed, ...rest } = prev;
        return rest;
      });
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Could not delete the list.");
    }
  }

  function handleSaved(card: CardT) {
    setCardsByList((prev) => {
      const listId = card.listId;
      if (!listId) return prev;
      const existing = prev[listId] ?? [];
      const withoutCard = existing.filter((c) => c.id !== card.id);
      return { ...prev, [listId]: [...withoutCard, card] };
    });
    setDialogState(null);
  }

  function handleDeleted(cardId: string) {
    setCardsByList((prev) => {
      const next: Record<string, CardT[]> = {};
      for (const [listId, cards] of Object.entries(prev)) {
        next[listId] = cards.filter((c) => c.id !== cardId);
      }
      return next;
    });
    setDialogState(null);
  }

  if (lists === null) {
    return (
      <div className="flex gap-3 p-4">
        <Skeleton className="h-64 w-72" />
        <Skeleton className="h-64 w-72" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        {lists.map((list) => (
          <BoardColumn
            key={list.id}
            list={list}
            cards={cardsByList[list.id] ?? []}
            members={members}
            onAddCard={() => setDialogState({ card: null, listId: list.id })}
            onDeleteList={() => deleteList(list.id)}
            onOpenCard={(card) => setDialogState({ card, listId: list.id })}
          />
        ))}
        <DragOverlay>
          {activeCard ? <IssueCard card={activeCard} onOpen={() => undefined} /> : null}
        </DragOverlay>
      </DndContext>

      <div className="w-72 shrink-0">
        {addingList ? (
          <form onSubmit={createList} className="flex flex-col gap-2 rounded-md border border-border bg-surface-raised p-3">
            <Field label="List name" htmlFor="new-list-name">
              <Input
                id="new-list-name"
                autoFocus
                required
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" className="flex-1">
                Add list
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAddingList(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="ghost"
            icon={<Plus size={16} weight="bold" />}
            onClick={() => setAddingList(true)}
            className="w-full justify-start text-ink-muted"
          >
            Add list
          </Button>
        )}
      </div>

      {dialogState && (
        <IssueDialog
          open
          onClose={() => setDialogState(null)}
          projectId={projectId}
          listId={dialogState.listId}
          members={members}
          card={dialogState.card}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
