"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CheckSquare, Plus, Square, Trash } from "@phosphor-icons/react";
import { Button, IconButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api, ApiError } from "@/lib/apiClient";
import type { ChecklistItemT } from "./types";

export function ChecklistSection({ cardId }: { cardId: string }) {
  const toast = useToast();
  const [items, setItems] = useState<ChecklistItemT[] | null>(null);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ items: ChecklistItemT[] }>(`/api/cards/${cardId}/checklist-items`)
      .then((data) => {
        if (!cancelled) setItems(data.items);
      })
      .catch(() => toast.push("Could not load the checklist."));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setAdding(true);
    try {
      const { item } = await api<{ item: ChecklistItemT }>(`/api/cards/${cardId}/checklist-items`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setItems((prev) => [...(prev ?? []), item]);
      setText("");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Could not add the item.");
    } finally {
      setAdding(false);
    }
  }

  async function toggle(item: ChecklistItemT) {
    setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) ?? null);
    try {
      const { item: updated } = await api<{ item: ChecklistItemT }>(`/api/checklist-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ version: item.version, done: !item.done }),
      });
      setItems((prev) => prev?.map((i) => (i.id === updated.id ? updated : i)) ?? null);
    } catch (err) {
      setItems((prev) => prev?.map((i) => (i.id === item.id ? item : i)) ?? null);
      toast.push(err instanceof ApiError ? err.message : "Could not update the item.");
    }
  }

  async function remove(itemId: string) {
    const previous = items;
    setItems((prev) => prev?.filter((i) => i.id !== itemId) ?? null);
    try {
      await api(`/api/checklist-items/${itemId}`, { method: "DELETE" });
    } catch (err) {
      setItems(previous);
      toast.push(err instanceof ApiError ? err.message : "Could not remove the item.");
    }
  }

  const done = items?.filter((i) => i.done).length ?? 0;
  const total = items?.length ?? 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">Checklist</h3>
        {total > 0 && (
          <span className="text-xs text-ink-muted">
            {done}/{total}
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="h-1 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        {items?.map((item) => (
          <div key={item.id} className="group flex items-center gap-2 rounded-sm px-1 py-1 hover:bg-surface-sunken">
            <button type="button" onClick={() => toggle(item)} className="shrink-0 text-ink-muted">
              {item.done ? (
                <CheckSquare size={18} weight="fill" className="text-accent" />
              ) : (
                <Square size={18} />
              )}
            </button>
            <span className={`flex-1 text-sm ${item.done ? "text-ink-faint line-through" : "text-ink"}`}>
              {item.text}
            </span>
            <IconButton
              aria-label="Remove item"
              onClick={() => remove(item.id)}
              className="opacity-0 group-hover:opacity-100"
            >
              <Trash size={14} />
            </IconButton>
          </div>
        ))}
      </div>

      <form onSubmit={addItem} className="flex gap-2">
        <label htmlFor="new-checklist-item" className="sr-only">
          New checklist item
        </label>
        <Input
          id="new-checklist-item"
          placeholder="Add an item…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="secondary" icon={<Plus size={14} weight="bold" />} loading={adding}>
          Add
        </Button>
      </form>
    </div>
  );
}
