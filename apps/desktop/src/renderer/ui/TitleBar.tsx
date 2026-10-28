/** The title bar (V1): app mark, the document's title, its place (Private or Public) and the save state. */
import { useEffect, useState } from "react";
import { DocumentText20Regular, Globe16Regular, LockClosed16Regular } from "@fluentui/react-icons";
import { getEditor, renameDoc, focusEditor } from "../session.ts";
import { app } from "../state.ts";
import { toggleHistory } from "../versions.ts";

const SAVE_TEXT = { saved: "Saved to this computer", saving: "Saving…", error: "Couldn't save. Retrying…" } as const;

export function TitleBar() {
  const current = app.use((s) => s.current);
  const title = app.use((s) => s.doc?.title ?? "");
  const save = app.use((s) => s.save);
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
              {SAVE_TEXT[save]}
            </span>
          </button>
        </>
      ) : (
        <span className="title-text">P-Doc</span>
      )}
      <span className="titlebar-fill" />
    </header>
  );
}
