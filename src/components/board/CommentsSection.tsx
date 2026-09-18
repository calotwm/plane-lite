"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { PaperPlaneTilt, Trash } from "@phosphor-icons/react";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api, ApiError } from "@/lib/apiClient";
import type { CommentT } from "./types";

export function CommentsSection({
  cardId,
  currentUserId,
  isAdmin,
}: {
  cardId: string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const toast = useToast();
  const [comments, setComments] = useState<CommentT[] | null>(null);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ comments: CommentT[] }>(`/api/cards/${cardId}/comments`)
      .then((data) => {
        if (!cancelled) setComments(data.comments);
      })
      .catch(() => toast.push("Could not load comments."));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  async function post(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    try {
      const { comment } = await api<{ comment: CommentT }>(`/api/cards/${cardId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setComments((prev) => [...(prev ?? []), comment]);
      setBody("");
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : "Could not post the comment.");
    } finally {
      setPosting(false);
    }
  }

  async function remove(commentId: string) {
    const previous = comments;
    setComments((prev) => prev?.filter((c) => c.id !== commentId) ?? null);
    try {
      await api(`/api/comments/${commentId}`, { method: "DELETE" });
    } catch (err) {
      setComments(previous);
      toast.push(err instanceof ApiError ? err.message : "Could not delete the comment.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-ink">Comments</h3>

      <div className="flex flex-col gap-3">
        {comments?.map((c) => (
          <div key={c.id} className="group flex gap-2">
            <Avatar name={c.author.name} size={24} />
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium text-ink">{c.author.name}</span>
                <span className="text-xs text-ink-faint">
                  {new Date(c.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                {(c.author.id === currentUserId || isAdmin) && (
                  <IconButton
                    aria-label="Delete comment"
                    onClick={() => remove(c.id)}
                    className="ml-auto opacity-0 group-hover:opacity-100"
                  >
                    <Trash size={12} />
                  </IconButton>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm text-ink-muted">{c.body}</p>
            </div>
          </div>
        ))}
        {comments?.length === 0 && <p className="text-sm text-ink-faint">No comments yet.</p>}
      </div>

      <form onSubmit={post} className="flex flex-col gap-2">
        <label htmlFor="new-comment" className="sr-only">
          Write a comment
        </label>
        <Textarea
          id="new-comment"
          rows={2}
          placeholder="Write a comment…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          type="submit"
          disabled={posting || !body.trim()}
          className="inline-flex items-center gap-1.5 self-end rounded-sm bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-50"
        >
          <PaperPlaneTilt size={14} weight="bold" />
          Comment
        </button>
      </form>
    </div>
  );
}
