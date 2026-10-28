/** The Review panel (U26): suggested changes and comment threads in document order (spec §4.5). */
import { useEffect, useRef, useState } from "react";
import { ArrowUndo20Regular, Checkmark20Regular, ChevronDown20Regular, ChevronUp20Regular, Dismiss20Regular, MoreHorizontal20Regular } from "@fluentui/react-icons";
import type { CommentReply } from "@p-doc/core";
import { draftKey } from "../editor/review.ts";
import { getEditor } from "../session.ts";
import { app } from "../state.ts";
import { versionTime } from "../versions.ts";
import {
  askDeleteComment,
  cancelDraft,
  canDecide,
  closeReview,
  decide,
  decideAll,
  isMine,
  openCounts,
  postComment,
  replyTo,
  resolveThread,
  review,
  reviewItems,
  reviewersOf,
  saveEdit,
  selectItem,
  step,
  type ReviewItem,
} from "../review.ts";
import { MenuList, useOutside, type MenuItemSpec } from "./Menu.tsx";

type ChangeItem = Extract<ReviewItem, { kind: "change" }>;
type CommentItem = Extract<ReviewItem, { kind: "comment" }>;

const when = (iso: string) => (iso && !Number.isNaN(Date.parse(iso)) ? versionTime(iso) : "");
const excerpt = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A text box for a comment, a reply or an edit. Ctrl+Enter sends; Esc cancels. A reply box stays one line until used. */
function CommentBox(o: { id?: string; label: string; action: string; initial?: string; compact?: boolean; autoFocus?: boolean; onSubmit: (text: string) => void; onCancel?: () => void }) {
  const [text, setText] = useState(o.initial ?? "");
  const [open, setOpen] = useState(!o.compact);
  const box = useRef<HTMLDivElement>(null);
  const cancel = () => {
    setText(o.initial ?? "");
    if (o.compact) setOpen(false);
    o.onCancel?.();
  };
  const send = () => {
    if (!text.trim()) return;
    o.onSubmit(text);
    setText("");
    if (o.compact) setOpen(false);
  };
  return (
    <div ref={box} className="comment-box">
      <textarea
        id={o.id}
        className="field comment-field"
        aria-label={o.label}
        placeholder={o.label}
        rows={open ? 3 : 1}
        value={text}
        autoFocus={o.autoFocus}
        onFocus={(e) => {
          setOpen(true);
          if (o.initial) e.target.select();
        }}
        onBlur={(e) => {
          if (o.compact && !text && !box.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            cancel();
            if (o.compact) e.currentTarget.blur();
          }
        }}
      />
      {open ? (
        <div className="comment-actions">
          <button type="button" className="btn small subtle" onClick={cancel}>
            Cancel
          </button>
          <button type="button" className="btn small primary" disabled={!text.trim()} onClick={send}>
            {o.action}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CommentMenu({ label, items }: { label: string; items: MenuItemSpec[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, open, () => setOpen(false));
  return (
    <div ref={ref} className="row-menu">
      <button type="button" className="icon-btn" aria-label={`More actions for ${label}`} title="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal20Regular />
      </button>
      {open ? (
        <MenuList
          items={items}
          label={`Actions for ${label}`}
          className="row-dropdown"
          onClose={(restore) => {
            setOpen(false);
            if (restore) ref.current?.querySelector("button")?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

function Who({ author, time, edited }: { author: string; time: string; edited?: string }) {
  return (
    <span className="review-who">
      <span className="review-author">{author || "Someone"}</span>
      <span className="doc-meta">
        {when(time)}
        {edited ? " (edited)" : ""}
      </span>
    </span>
  );
}

/** Reviewer check items share the app menu's keyboard model; comments are not hidden (U65).
 * @tier compound @a11y Everyone restores all reviewers; checked items expose each selection.
 */
function ReviewerMenu({ authors, selected }: { authors: string[]; selected: string[] | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, open, () => setOpen(false));
  const choose = (author: string) => {
    const now = selected ?? authors;
    review.set({ reviewers: now.includes(author) ? now.filter((a) => a !== author) : [...now, author], active: null });
  };
  return (
    <div ref={ref} className="row-menu">
      <button type="button" className="btn small" aria-label="Reviewers" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {selected === null ? "Everyone" : "Reviewers"} <ChevronDown20Regular aria-hidden />
      </button>
      {open ? <MenuList
        label="Reviewers"
        className="row-dropdown"
        items={[
          { key: "everyone", label: "Everyone", checked: selected === null, run: () => review.set({ reviewers: null, active: null }) },
          ...authors.map((author) => ({ key: `author:${author}`, label: author || "Someone", checked: selected === null || selected.includes(author), run: () => choose(author) })),
        ]}
        onClose={(restore) => { setOpen(false); if (restore) ref.current?.querySelector("button")?.focus(); }}
      /> : null}
    </div>
  );
}

function ChangeCard({ it, active, can }: { it: ChangeItem; active: boolean; can: boolean }) {
  const c = it.change;
  const added = c.kind === "insertion";
  const text = c.text === "¶" ? "paragraph break" : excerpt(c.text);
  const Mark = added ? "ins" : "del";
  const body =
    c.kind === "format" ? (
      <>
        <span className="muted">Formatted: </span>
        {c.format} <span className="muted">on “{text}”</span>
      </>
    ) : (
      <>
        <span className="muted">{added ? "Add" : "Delete"}: </span>
        <Mark className={added ? "pd-insertion" : "pd-deletion"}>{c.text === "¶" ? <em>{text}</em> : `“${text}”`}</Mark>
      </>
    );
  return (
    <li className={`review-card${active ? " active" : ""}`} data-key={it.key} data-testid="review-item" data-kind={c.kind}>
      <div className="review-head">
        <button type="button" className="review-open" aria-current={active || undefined} onClick={() => selectItem(it, false)}>
          <Who author={c.author} time={c.time} />
        </button>
        <button type="button" className="icon-btn" aria-label="Accept" title="Accept" disabled={!can} onClick={() => decide(it, "accept")}>
          <Checkmark20Regular />
        </button>
        <button type="button" className="icon-btn" aria-label="Reject" title="Reject" disabled={!can} onClick={() => decide(it, "reject")}>
          <Dismiss20Regular />
        </button>
      </div>
      <p className="review-body">{body}</p>
    </li>
  );
}

function ReplyRow({ threadId, r }: { threadId: string; r: CommentReply }) {
  const editing = review.use((s) => s.editing === `${threadId}/${r.id}`);
  const items: MenuItemSpec[] = [
    ...(isMine(r.author) ? [{ key: "edit", label: "Edit", run: () => review.set({ editing: `${threadId}/${r.id}` }) }] : []),
    { key: "delete", label: "Delete", danger: true, run: () => askDeleteComment(threadId, r.id) },
  ];
  return (
    <div className="review-reply" data-testid="review-reply">
      <div className="review-head">
        <Who author={r.author} time={r.created} edited={r.edited} />
        <CommentMenu label={`the reply by ${r.author}`} items={items} />
      </div>
      {editing ? (
        <CommentBox label="Edit reply" action="Save" initial={r.body} autoFocus onSubmit={(t) => saveEdit(threadId, r.id, t)} onCancel={() => review.set({ editing: null })} />
      ) : (
        <p className="review-body">{r.body}</p>
      )}
    </div>
  );
}

function ThreadCard({ it, active }: { it: CommentItem; active: boolean }) {
  const t = it.thread;
  const editing = review.use((s) => s.editing === t.id);
  const items: MenuItemSpec[] = [
    ...(isMine(t.author) ? [{ key: "edit", label: "Edit", run: () => review.set({ editing: t.id }) }] : []),
    { key: "delete", label: "Delete", danger: true, run: () => askDeleteComment(t.id, null) },
  ];
  return (
    <li className={`review-card comment${active ? " active" : ""}${t.resolved ? " resolved" : ""}`} data-key={it.key} data-testid="review-item" data-kind="comment">
      <div className="review-head">
        <button type="button" className="review-open" aria-current={active || undefined} onClick={() => selectItem(it, false)}>
          <Who author={t.author} time={t.created} edited={t.edited} />
        </button>
        {t.resolved ? (
          <button type="button" className="icon-btn" aria-label="Reopen" title="Reopen" onClick={() => resolveThread(it, false)}>
            <ArrowUndo20Regular />
          </button>
        ) : (
          <button type="button" className="icon-btn" aria-label="Resolve" title="Resolve" onClick={() => resolveThread(it, true)}>
            <Checkmark20Regular />
          </button>
        )}
        <CommentMenu label={`the comment by ${t.author}`} items={items} />
      </div>
      {it.gone ? (
        <p className="review-gone">
          <strong>Text deleted.</strong> “{excerpt(t.quote, 80)}”
        </p>
      ) : t.resolved ? (
        <p className="review-quote">“{excerpt(t.quote, 80)}”</p>
      ) : null}
      {editing ? (
        <CommentBox label="Edit comment" action="Save" initial={t.body} autoFocus onSubmit={(x) => saveEdit(t.id, null, x)} onCancel={() => review.set({ editing: null })} />
      ) : (
        <p className="review-body">{t.body}</p>
      )}
      {t.replies.map((r) => (
        <ReplyRow key={r.id} threadId={t.id} r={r} />
      ))}
      {t.resolved ? null : <CommentBox label="Reply" action="Reply" compact onSubmit={(x) => replyTo(t.id, x)} />}
    </li>
  );
}

function DraftCard({ quote }: { quote: string }) {
  return (
    <li className="review-card comment active" data-key="draft" data-testid="comment-draft">
      <p className="review-quote">“{excerpt(quote, 80)}”</p>
      <CommentBox id="comment-draft" label="Add a comment" action="Comment" autoFocus onSubmit={postComment} onCancel={() => cancelDraft()} />
    </li>
  );
}

export function ReviewPanel() {
  app.use((s) => s.tick);
  const comments = app.use((s) => s.doc?.comments);
  const current = app.use((s) => s.current);
  app.use((s) => s.mode);
  const filter = review.use((s) => s.filter);
  const reviewers = review.use((s) => s.reviewers);
  const draft = review.use((s) => s.draft);
  const active = review.use((s) => s.active);
  const editor = getEditor();
  const threads = comments ?? [];
  const items = editor ? reviewItems(editor.state.doc, threads, filter, draftKey.getState(editor.state) ?? null, reviewers) : [];
  const shownChanges = items.filter((it) => it.kind === "change").length;
  const authors = editor ? reviewersOf(editor.state.doc) : [];
  const counts = editor ? openCounts(editor.state.doc, threads) : { changes: 0, comments: 0 };
  const resolved = threads.filter((t) => t.resolved).length;
  const can = canDecide();

  // Another document: the old one's draft and pick don't apply.
  const space = current?.space;
  const path = current?.path;
  useEffect(() => {
    review.set({ active: null, editing: null });
    return () => cancelDraft(false);
  }, [space, path]);

  const draftShown = !!draft && filter === "open";
  const orphanDraft = draftShown && !items.some((i) => i.kind === "draft");

  return (
    <aside
      id="review-panel"
      className="right-panel"
      aria-label="Review"
      data-region
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          closeReview();
        }
      }}
    >
      <div className="panel-head">
        <h2 className="panel-title">Review</h2>
        <button type="button" className="icon-btn" aria-label="Close review" title="Close (Esc)" onClick={closeReview} data-autofocus>
          <Dismiss20Regular />
        </button>
      </div>
      <div className="review-bar">
        <span className="review-counts" data-testid="review-counts">
          {counts.changes === 1 ? "1 change" : `${counts.changes} changes`} · {counts.comments === 1 ? "1 comment" : `${counts.comments} comments`}
        </span>
        <button type="button" className="icon-btn" aria-label="Previous change or comment" title="Previous" onClick={() => step(-1)}>
          <ChevronUp20Regular />
        </button>
        <button type="button" className="icon-btn" aria-label="Next change or comment" title="Next" onClick={() => step(1)}>
          <ChevronDown20Regular />
        </button>
      </div>
      <div className="review-bar">
        <button type="button" className="btn small" disabled={!can || !shownChanges} onClick={() => decideAll("accept")}>
          {reviewers === null ? "Accept all" : `Accept ${shownChanges} shown`}
        </button>
        <button type="button" className="btn small" disabled={!can || !shownChanges} onClick={() => decideAll("reject")}>
          {reviewers === null ? "Reject all" : `Reject ${shownChanges} shown`}
        </button>
      </div>
      {!can && counts.changes ? <p className="muted small panel-note">Switch to Editing or Suggesting to accept or reject changes.</p> : null}
      <div className="review-filter" role="group" aria-label="Show">
        <ReviewerMenu authors={authors} selected={reviewers} />
        <button type="button" className={`chip${filter === "open" ? " on" : ""}`} aria-pressed={filter === "open"} onClick={() => review.set({ filter: "open", active: null })}>
          Open
        </button>
        <button type="button" className={`chip${filter === "resolved" ? " on" : ""}`} aria-pressed={filter === "resolved"} onClick={() => review.set({ filter: "resolved", active: null })}>
          Resolved{resolved ? ` (${resolved})` : ""}
        </button>
      </div>
      <div className="lib-scroll">
        {items.length || orphanDraft ? (
          <ul className="review-list" aria-label={filter === "open" ? "Changes and comments" : "Resolved comments"}>
            {orphanDraft ? <DraftCard quote={draft!.quote} /> : null}
            {items.map((it) =>
              it.kind === "change" ? (
                <ChangeCard key={it.key} it={it} active={active === it.key} can={can} />
              ) : it.kind === "comment" ? (
                <ThreadCard key={it.key} it={it} active={active === it.key} />
              ) : draftShown ? (
                <DraftCard key="draft" quote={draft!.quote} />
              ) : null,
            )}
          </ul>
        ) : (
          <p className="empty">{filter === "open" ? reviewers !== null ? "No changes from these reviewers. Choose Everyone to see all changes." : "No suggestions or comments. Switch to Suggesting to suggest changes, or select text and press Ctrl+Alt+M to comment." : "No resolved comments."}</p>
        )}
      </div>
    </aside>
  );
}
