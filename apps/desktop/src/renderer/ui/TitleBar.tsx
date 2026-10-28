/** The title bar (V1): app mark, the document's title, its place (Private or Public) and the save state. */
import { useEffect, useState } from "react";
import { CommentEdit16Regular, CommentMultiple20Regular, DocumentText20Regular, Eye16Regular, Globe16Regular, LockClosed16Regular } from "@fluentui/react-icons";
import { getEditor, renameDoc, focusEditor } from "../session.ts";
import { app } from "../state.ts";
import { toggleHistory } from "../versions.ts";
import { MODE_NAMES, openCounts, toggleReview } from "../review.ts";
import { unsynced } from "../sync.ts";

const SAVE_TEXT = { saved: "Saved to this computer", saving: "Saving…", error: "Couldn't save. Retrying…" } as const;

export function TitleBar() {
  const current = app.use((s) => s.current);
  const title = app.use((s) => s.doc?.title ?? "");
  const save = app.use((s) => s.save);
  const mode = app.use((s) => s.mode);
  const synced = app.use((s) => !!s.current && s.sync?.state.kind === "synced" && !unsynced(s.sync, s.current));
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [current?.path, current?.space]);

  const commit = () => {
    if (draft == null || !current) return;
    const t = draft.trim();
    setDraft(null);
    if (t && t !== title) void renameDoc(current, t);
  };

  return (
    <header className="titlebar">
      <span className="app-mark" aria-hidden>
        <DocumentText20Regular />
      </span>
      {current ? (
        <>
          <input
            id="doc-title"
            className="title-field"
            aria-label="Document title"
            value={draft ?? title}
            size={Math.max(8, Math.min(48, (draft ?? title).length + 1))}
            onFocus={(e) => {
              setDraft(title);
              e.target.select();
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
                focusEditor();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft(null);
                focusEditor();
              }
            }}
          />
          <span className={`space-badge ${current.space}`} title={current.space === "public" ? "Anyone can read this on GitHub" : "Only you can read this"}>
            {current.space === "public" ? <Globe16Regular aria-hidden /> : <LockClosed16Regular aria-hidden />}
            {current.space === "public" ? "Public" : "Private"}
          </span>
          <button type="button" className="save-button" title="See version history (Ctrl+Alt+Shift+H)" aria-label="See version history" aria-describedby="save-state" onClick={toggleHistory}>
            <span id="save-state" className={`save-state ${save}`} role="status" aria-live="polite" data-testid="save-state">
              {save === "saved" && synced ? "Saved · synced" : SAVE_TEXT[save]}
            </span>
          </button>
          {mode !== "editing" ? (
            <span className={`mode-badge ${mode}`} data-testid="mode-badge" title={mode === "suggesting" ? "Your edits become suggestions (Ctrl+Alt+Shift+Z for Editing)" : "Read only (Ctrl+Alt+Shift+Z for Editing)"}>
              {mode === "suggesting" ? <CommentEdit16Regular aria-hidden /> : <Eye16Regular aria-hidden />}
              {MODE_NAMES[mode]}
            </span>
          ) : null}
        </>
      ) : (
        <span className="title-text">P-Doc</span>
      )}
      <span className="titlebar-fill" />
      {current ? <ReviewButton /> : null}
    </header>
  );
}

/** Opens the Review panel; shows how many changes and open comments there are. */
function ReviewButton() {
  app.use((s) => s.tick);
  const comments = app.use((s) => s.doc?.comments);
  const on = app.use((s) => s.review);
  const e = getEditor();
  const c = e ? openCounts(e.state.doc, comments ?? []) : { changes: 0, comments: 0 };
  const n = c.changes + c.comments;
  const label = `Review: ${c.changes === 1 ? "1 change" : `${c.changes} changes`}, ${c.comments === 1 ? "1 comment" : `${c.comments} comments`}`;
  return (
    <button type="button" className="review-button" aria-label={label} title={label} aria-pressed={on} onClick={toggleReview} data-testid="review-button">
      <CommentMultiple20Regular aria-hidden />
      {n ? <span className="review-count">{n > 99 ? "99+" : n}</span> : null}
    </button>
  );
}
