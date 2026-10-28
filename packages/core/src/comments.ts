/**
 * Comment threads (U25): threads live in the file's `comments` list, and each is anchored in the
 * content by `comment` marks carrying its id. Pure helpers over both, used by the app and the tests.
 */
import type { Node as PMNode } from "@tiptap/pm/model";
import type { CommentReply, CommentThread } from "./format.ts";

const newId = (prefix: string) => `${prefix}-${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
export const commentId = () => newId("c");

export interface CommentAnchor {
  from: number;
  to: number;
  text: string;
}

/** Where each thread's text is. A thread missing from the map has had its text deleted. */
export function commentAnchors(doc: PMNode): Map<string, CommentAnchor> {
  const out = new Map<string, CommentAnchor>();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const end = pos + node.nodeSize;
    for (const m of node.marks) {
      const id = m.attrs.id as unknown;
      if (m.type.name !== "comment" || typeof id !== "string" || !id) continue;
      const a = out.get(id);
      if (a) {
        a.text += (pos > a.to ? " " : "") + (node.text ?? "");
        a.to = end;
      } else out.set(id, { from: pos, to: end, text: node.text ?? "" });
    }
    return true;
  });
  return out;
}

export function newThread(author: string, body: string, quote: string, id = commentId(), now = new Date()): CommentThread {
  return { id, author, created: now.toISOString(), body: body.trim(), resolved: false, quote, replies: [] };
}

export function addReply(threads: CommentThread[], threadId: string, author: string, body: string, now = new Date()): CommentThread[] {
  const reply: CommentReply = { id: newId("r"), author, created: now.toISOString(), body: body.trim() };
  return threads.map((t) => (t.id === threadId ? { ...t, replies: [...t.replies, reply] } : t));
}

/** Changes a thread's first comment (`replyId` null) or one reply, noting when. */
export function editComment(threads: CommentThread[], threadId: string, replyId: string | null, body: string, now = new Date()): CommentThread[] {
  const edited = now.toISOString();
  const text = body.trim();
  return threads.map((t) => {
    if (t.id !== threadId) return t;
    if (replyId == null) return { ...t, body: text, edited };
    return { ...t, replies: t.replies.map((r) => (r.id === replyId ? { ...r, body: text, edited } : r)) };
  });
}

export function setResolved(threads: CommentThread[], threadId: string, resolved: boolean): CommentThread[] {
  return threads.map((t) => (t.id === threadId ? { ...t, resolved } : t));
}

/** Removes a whole thread (`replyId` null) or one reply. */
export function removeComment(threads: CommentThread[], threadId: string, replyId: string | null = null): CommentThread[] {
  if (replyId == null) return threads.filter((t) => t.id !== threadId);
  return threads.map((t) => (t.id === threadId ? { ...t, replies: t.replies.filter((r) => r.id !== replyId) } : t));
}
