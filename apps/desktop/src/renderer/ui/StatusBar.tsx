/** The status bar (V1): words, sync status and zoom. */
import { useMemo } from "react";
import { Add20Regular, CloudOff16Regular, Subtract20Regular } from "@fluentui/react-icons";
import { runCommand } from "../commands.ts";
import { getEditor } from "../session.ts";
import { pageLayout } from "../editor/pages.ts";
import { app, openDialog } from "../state.ts";
import { MARKUP_NAMES, setMarkup } from "../review.ts";

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

export function StatusBar() {
  app.use((s) => s.tick);
  const zoom = app.use((s) => s.settings?.zoom ?? 100);
  const markup = app.use((s) => s.markup);
  const layout = pageLayout.use((s) => s.layout);
  const editor = getEditor();
  const docRef = editor?.state.doc;
  const words = useMemo(() => (docRef ? countWords(docRef.textBetween(0, docRef.content.size, " ", " ")) : 0), [docRef]);
  const page = layout && editor ? (layout.pageOf[editor.state.selection.$from.index(0)] ?? 1) : null;
  return (
    <footer className="statusbar" data-region aria-label="Status">
      {layout && page != null && (
        <span className="status-item" data-testid="page-indicator">
          Page {page} of {layout.pages}
        </span>
      )}
      <button type="button" className="status-btn" onClick={() => openDialog({ kind: "wordCount" })} title="Word count (Ctrl+Shift+C)" data-testid="word-total">
        {words === 1 ? "1 word" : `${words.toLocaleString()} words`}
      </button>
      <span className="status-fill" />
      {markup !== "all" ? (
        <button
          type="button"
          className="status-btn markup-note"
          data-testid="markup-note"
          title={markup === "simple" ? "Show all markup" : "Read only. Show all markup to edit."}
          onClick={() => setMarkup("all")}
        >
          {MARKUP_NAMES[markup]}
          {markup === "simple" ? "" : " · read only"}
        </button>
      ) : null}
      <span className="status-item" title="Documents are saved on this computer. Connect GitHub in Settings to sync.">
        <CloudOff16Regular aria-hidden /> Not connected to GitHub
      </span>
      <span className="status-zoom">
        <button type="button" className="icon-btn tiny" aria-label="Zoom out (Ctrl+-)" title="Zoom out (Ctrl+-)" onClick={() => runCommand("view.zoomOut")}>
          <Subtract20Regular />
        </button>
        <button type="button" className="status-btn" aria-label={`Zoom ${zoom}%. Reset to 100% (Ctrl+0)`} title="Actual size (Ctrl+0)" onClick={() => runCommand("view.zoomReset")}>
          {zoom}%
        </button>
        <button type="button" className="icon-btn tiny" aria-label="Zoom in (Ctrl+=)" title="Zoom in (Ctrl+=)" onClick={() => runCommand("view.zoomIn")}>
          <Add20Regular />
        </button>
      </span>
    </footer>
  );
}
