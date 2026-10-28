/**
 * Review (spec §4.5): Editing, Suggesting and Viewing; how suggestions show; comment threads; and the
 * Review panel's list of changes and comments, with accept, reject and moving between them.
 */
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { addReply, changesOf, commentAnchors, commentId, editComment, newThread, removeComment, setResolved, type Change, type CommentAnchor, type CommentThread, type Decision } from "@p-doc/core";
import { createStore } from "./lib/store.ts";
import { draftKey, type DraftRange } from "./editor/review.ts";
import { schedule } from "./editor/pages.ts";
import { focusEditor, getEditor, updateDoc } from "./session.ts";
import { app, closeDialog, openDialog, pageEditable, toast, type Markup, type Mode } from "./state.ts";
import { backToCurrent, history } from "./versions.ts";

export type Filter = "open" | "resolved";

export interface ReviewState {
  filter: Filter;
  /** The new comment's card is open, quoting its text. */
  draft: { quote: string } | null;
  /** The item last picked in the panel. */
  active: string | null;
  /** The comment being changed: "thread" or "thread/reply". */
  editing: string | null;
}

export const review = createStore<ReviewState>({ filter: "open", draft: null, active: null, editing: null });

export type ReviewItem =
  | { kind: "change"; key: string; change: Change; from: number; to: number }
  | { kind: "comment"; key: string; thread: CommentThread; from: number; to: number; /** Its text was deleted. */ gone: boolean }
  | { kind: "draft"; key: "draft"; from: number; to: number };

const scans = new WeakMap<PMNode, { changes: Change[]; anchors: Map<string, CommentAnchor> }>();
/** Changes and comment anchors of a document, read once per document state. */
function scan(doc: PMNode) {
  let s = scans.get(doc);
  if (!s) {
    s = { changes: changesOf(doc), anchors: commentAnchors(doc) };
    scans.set(doc, s);
  }
  return s;
}

/** The panel's list in document order: changes and open threads, or resolved threads. Threads whose text is gone come last. */
export function reviewItems(doc: PMNode, threads: CommentThread[], filter: Filter, draft: DraftRange | null): ReviewItem[] {
  const { changes, anchors } = scan(doc);
  const out: ReviewItem[] = [];
  if (filter === "open") {
    for (const c of changes) out.push({ kind: "change", key: `${c.kind}:${c.id}`, change: c, from: c.from, to: c.to });
    if (draft) out.push({ kind: "draft", key: "draft", from: draft.from, to: draft.to });
  }
  for (const t of threads) {
    if (t.resolved !== (filter === "resolved")) continue;
    const a = anchors.get(t.id);
    out.push({ kind: "comment", key: `comment:${t.id}`, thread: t, from: a?.from ?? Number.MAX_SAFE_INTEGER, to: a?.to ?? Number.MAX_SAFE_INTEGER, gone: !a });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** Open changes and comment threads, for the title bar and the panel's header. */
export function openCounts(doc: PMNode, threads: CommentThread[]): { changes: number; comments: number } {
  return { changes: scan(doc).changes.length, comments: threads.filter((t) => !t.resolved).length };
}

const threads = () => app.get().doc?.comments ?? [];
const setThreads = (comments: CommentThread[]) => updateDoc({ comments });
const me = () => app.get().settings?.identity.name || "Me";
export const isMine = (author: string) => author === me();

// ------------------------------------------------------------------------------ Mode and markup

/** The page takes typing unless a version, Viewing or a read-only markup view is showing. */
export function syncEditable(): void {
  getEditor()?.setEditable(!history.get().viewing && pageEditable(app.get()), false);
}

/** Puts a newly made editor (another document opened) in the current mode. */
export function applyMode(e: Editor): void {
  const s = app.get();
  e.commands.setSuggesting(s.mode === "suggesting");
  e.setEditable(!history.get().viewing && pageEditable(s), false);
}

export const MODE_NAMES: Record<Mode, string> = { editing: "Editing", suggesting: "Suggesting", commenting: "Commenting", viewing: "Viewing" };
export const MARKUP_NAMES: Record<Markup, string> = { simple: "Simple markup", all: "All markup", none: "No markup", original: "Original" };

export function setMode(mode: Mode): void {
  if (mode === "editing" && app.get().doc?.alwaysSuggest) {
    openDialog({ kind: "turnOffSuggest" });
    return;
  }
  app.set({ mode });
  getEditor()?.commands.setSuggesting(mode === "suggesting");
  syncEditable();
  focusEditor();
}

/** A document preference, not a permission: turning it off is an explicit choice. */
export function setAlwaysSuggest(on: boolean): void {
  if (!app.get().doc || app.get().locked || history.get().viewing) return;
  updateDoc({ alwaysSuggest: on });
  if (on) setMode("suggesting");
}

export function turnOffSuggest(): void {
  setAlwaysSuggest(false);
  closeDialog();
  setMode("editing");
}

export function setMarkup(markup: Markup): void {
  app.set({ markup });
  syncEditable();
  // Hidden or shown text changes the page breaks.
  requestAnimationFrame(schedule);
}

/** Accepting and rejecting change the text, so not in Viewing or over a version. */
export const canDecide = () => !!getEditor() && !app.get().locked && (app.get().mode === "editing" || app.get().mode === "suggesting") && !history.get().viewing;

// ------------------------------------------------------------------------------ The panel

export function openReview(): void {
  if (!app.get().current) return;
  backToCurrent();
  app.set({ review: true, history: false, focus: false });
  requestAnimationFrame(() => document.querySelector<HTMLElement>("#review-panel [data-autofocus]")?.focus());
}

export function closeReview(): void {
  cancelDraft(false);
  review.set({ active: null, editing: null });
  app.set({ review: false });
  focusEditor();
}

export const toggleReview = () => (app.get().review ? closeReview() : openReview());

function itemsNow(): ReviewItem[] {
  const e = getEditor();
  return e ? reviewItems(e.state.doc, threads(), review.get().filter, draftKey.getState(e.state) ?? null) : [];
}

const focusCard = (key: string) =>
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`#review-panel [data-key="${CSS.escape(key)}"] .review-open`)?.focus());

/** Picks an item: its text is selected on the page and its card marked (and focused). */
export function selectItem(it: ReviewItem, focus = true): void {
  review.set({ active: it.key });
  const e = getEditor();
  if (e && !(it.kind === "comment" && it.gone)) {
    const doc = e.state.doc;
    const clamp = (n: number) => Math.max(0, Math.min(n, doc.content.size));
    e.view.dispatch(e.state.tr.setSelection(TextSelection.between(doc.resolve(clamp(it.from)), doc.resolve(clamp(it.to)))).scrollIntoView());
  }
  if (focus) focusCard(it.key);
}

/** Next or Previous: from the picked item, or else from the cursor; it wraps around. */
export function step(dir: 1 | -1): void {
  const e = getEditor();
  if (!e) return;
  if (!app.get().review) openReview();
  const items = itemsNow().filter((x) => x.kind !== "draft" && !(x.kind === "comment" && x.gone));
  if (!items.length) {
    toast(review.get().filter === "resolved" ? "No resolved comments." : "No changes or comments.");
    return;
  }
  const sel = e.state.selection.from;
  const active = review.get().active;
  const cur = items.findIndex((x) => x.key === active && sel >= x.from && sel <= x.to);
  let n: number;
  if (cur >= 0) n = (cur + dir + items.length) % items.length;
  else if (dir > 0) {
    n = items.findIndex((x) => x.from > sel);
    if (n < 0) n = 0;
  } else {
    n = items.length - 1;
    for (let i = items.length - 1; i >= 0; i--)
      if (items[i]!.from < sel) {
        n = i;
        break;
      }
  }
  selectItem(items[n]!);
}

/** After an item goes, the one now at its place (or the last) is picked. */
function pickFrom(pos: number): void {
  const items = itemsNow().filter((x) => x.kind !== "draft");
  const next = items.find((x) => x.from >= pos) ?? items[items.length - 1];
  if (next) selectItem(next);
  else {
    review.set({ active: null });
    requestAnimationFrame(() => document.querySelector<HTMLElement>("#review-panel [data-autofocus]")?.focus());
  }
}

/** Accepts or rejects one change, then moves to the next (W R-004). */
export function decide(it: Extract<ReviewItem, { kind: "change" }>, decision: Decision): void {
  const e = getEditor();
  if (!e || !canDecide()) return;
  e.commands.resolveChanges([it.change.id], decision);
  pickFrom(it.from);
}

export function decideAll(decision: Decision): void {
  const e = getEditor();
  if (!e || !canDecide()) return;
  const n = scan(e.state.doc).changes.length;
  if (!n) {
    toast("There are no suggestions.");
    return;
  }
  e.commands.resolveChanges(null, decision);
  review.set({ active: null });
  toast(`${decision === "accept" ? "Accepted" : "Rejected"} ${n === 1 ? "1 change" : `${n.toLocaleString()} changes`}.`);
}

// ------------------------------------------------------------------------------ Comments

const WORD = /[\p{L}\p{N}_'’-]/u;

/** The selection, or else the word at the cursor. */
function commentRange(e: Editor): DraftRange | null {
  const { from, to, empty, $from } = e.state.selection;
  if (!empty) return { from, to };
  const block = $from.parent;
  if (!block.isTextblock) return null;
  // One character per inline leaf (image, line break), so offsets match positions.
  const text = block.textBetween(0, block.content.size, undefined, "\u0000");
  let a = $from.parentOffset;
  let b = a;
  while (a > 0 && WORD.test(text[a - 1]!)) a--;
  while (b < text.length && WORD.test(text[b]!)) b++;
  if (a === b) return null;
  return { from: $from.start() + a, to: $from.start() + b };
}

/** Ctrl+Alt+M: a card for a new comment on the selection, with the text highlighted. */
export function startComment(): void {
  const e = getEditor();
  if (!e || !app.get().current) return;
  const r = commentRange(e);
  if (!r) {
    toast("Select some text to comment on.");
    return;
  }
  const quote = e.state.doc.textBetween(r.from, r.to, " ", " ").slice(0, 500);
  e.view.dispatch(e.state.tr.setMeta(draftKey, r));
  review.set({ draft: { quote }, filter: "open", active: "draft", editing: null });
  if (!app.get().review) {
    backToCurrent();
    app.set({ review: true, history: false, focus: false });
  }
  requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("#comment-draft")?.focus());
}

export function cancelDraft(refocus = true): void {
  const e = getEditor();
  if (e && draftKey.getState(e.state)) e.view.dispatch(e.state.tr.setMeta(draftKey, null));
  if (review.get().draft) review.set({ draft: null, active: null });
  if (refocus) focusEditor();
}

export function postComment(body: string): void {
  const e = getEditor();
  const d = review.get().draft;
  if (!body.trim() || !e || !d) return;
  const id = commentId();
  const r = draftKey.getState(e.state);
  // Not an undo step: undoing typing never takes a comment away.
  const tr = e.state.tr.setMeta(draftKey, null).setMeta("addToHistory", false);
  if (r) tr.addMark(r.from, r.to, e.schema.marks.comment!.create({ id }));
  e.view.dispatch(tr);
  setThreads([...threads(), newThread(me(), body, d.quote, id)]);
  review.set({ draft: null, active: `comment:${id}` });
  focusEditor();
}

export function replyTo(threadId: string, body: string): void {
  if (body.trim()) setThreads(addReply(threads(), threadId, me(), body));
}

export function saveEdit(threadId: string, replyId: string | null, body: string): void {
  review.set({ editing: null });
  if (body.trim()) setThreads(editComment(threads(), threadId, replyId, body));
}

/** Resolve keeps the thread under Resolved and takes its highlight away; Reopen brings both back (GD R-008). */
export function resolveThread(it: Extract<ReviewItem, { kind: "comment" }>, resolved: boolean): void {
  setThreads(setResolved(threads(), it.thread.id, resolved));
  pickFrom(it.from);
}

export const askDeleteComment = (thread: string, reply: string | null) => openDialog({ kind: "deleteComment", thread, reply });

export function deleteComment(threadId: string, replyId: string | null): void {
  closeDialog();
  if (replyId == null) {
    const e = getEditor();
    if (e) {
      const type = e.schema.marks.comment!;
      const tr = e.state.tr;
      e.state.doc.descendants((node, pos) => {
        if (node.isText) for (const m of node.marks) if (m.type === type && m.attrs.id === threadId) tr.removeMark(pos, pos + node.nodeSize, m);
        return true;
      });
      if (tr.docChanged) e.view.dispatch(tr.setMeta("addToHistory", false));
    }
  }
  setThreads(removeComment(threads(), threadId, replyId));
  toast(replyId ? "Reply deleted." : "Comment deleted.");
  if (app.get().review) requestAnimationFrame(() => document.querySelector<HTMLElement>("#review-panel [data-autofocus]")?.focus());
  else focusEditor();
}

/** Page CSS for review: resolved threads lose their highlight; the picked item is marked. */
export function reviewCss(list: CommentThread[], active: string | null): string {
  const scope = ".page:not(.version-page) .pd-content";
  const resolved = list.filter((t) => t.resolved).map((t) => `${scope} .pd-comment[data-comment="${CSS.escape(t.id)}"]`);
  let css = resolved.length ? `${resolved.join(",\n")} { background: none; }\n` : "";
  if (active?.startsWith("comment:")) css += `${scope} .pd-comment[data-comment="${CSS.escape(active.slice(8))}"] { background: var(--color-comment-active); }\n`;
  else if (active && /^(insertion|deletion):/.test(active)) css += `${scope} [data-id="${CSS.escape(active.split(":")[1]!)}"] { outline: var(--border-focus) solid var(--color-focus); }\n`;
  return css;
}
