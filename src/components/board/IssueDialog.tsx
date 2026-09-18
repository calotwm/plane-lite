"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { api, ApiError } from "@/lib/apiClient";
import { ChecklistSection } from "./ChecklistSection";
import { CommentsSection } from "./CommentsSection";
import type { CardT, MemberOption } from "./types";

interface IssueDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  listId: string | null;
  members: MemberOption[];
  card: CardT | null;
  currentUserId: string;
  isAdmin: boolean;
  onSaved: (card: CardT) => void;
  onDeleted: (cardId: string) => void;
}

export function IssueDialog({
  open,
  onClose,
  projectId,
  listId,
  members,
  card,
  currentUserId,
  isAdmin,
  onSaved,
  onDeleted,
}: IssueDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(card?.title ?? "");
    setDescription(card?.description ?? "");
    setPriority(card?.priority ?? "MEDIUM");
    setAssigneeId(card?.assigneeId ?? "");
    setDueDate(card?.dueDate ? card.dueDate.slice(0, 10) : "");
    setError(null);
  }, [open, card]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        title,
        description: description || null,
        priority,
        assigneeId: assigneeId || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      };
      if (card) {
        const { card: updated } = await api<{ card: CardT }>(`/api/cards/${card.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...payload, version: card.version }),
        });
        onSaved(updated);
      } else {
        const { card: created } = await api<{ card: CardT }>(`/api/projects/${projectId}/cards`, {
          method: "POST",
          body: JSON.stringify({ ...payload, listId }),
        });
        onSaved(created);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the card.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!card) return;
    setDeleting(true);
    try {
      await api(`/api/cards/${card.id}`, { method: "DELETE" });
      onDeleted(card.id);
    } catch {
      setError("Could not delete the card.");
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={card ? "Edit card" : "New card"} wide={Boolean(card)}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Title" htmlFor="card-title">
          <Input id="card-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="card-description" hint="Optional">
          <Textarea
            id="card-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority" htmlFor="card-priority">
            <Select
              id="card-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as "LOW" | "MEDIUM" | "HIGH")}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </Select>
          </Field>
          <Field label="Due date" htmlFor="card-due" hint="Optional">
            <Input
              id="card-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>
        {members.length > 0 && (
          <Field label="Assignee" htmlFor="card-assignee" hint="Optional">
            <Select id="card-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex items-center justify-between">
          {card ? (
            <Button
              type="button"
              variant="ghost"
              icon={<Trash size={16} />}
              loading={deleting}
              onClick={onDelete}
              className="text-danger hover:bg-danger/10"
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {card ? "Save" : "Create card"}
            </Button>
          </div>
        </div>
      </form>

      {card && (
        <div className="mt-5 flex flex-col gap-5 border-t border-border pt-4">
          <ChecklistSection cardId={card.id} />
          <CommentsSection cardId={card.id} currentUserId={currentUserId} isAdmin={isAdmin} />
        </div>
      )}
    </Dialog>
  );
}
