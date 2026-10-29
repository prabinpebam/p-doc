/** The find bar (U10): non-modal, Ctrl+F to find and Ctrl+H to replace too. */
import { useEffect, useRef, useState } from "react";
import { ArrowDown16Regular, ArrowUp16Regular, Dismiss16Regular } from "@fluentui/react-icons";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { FindOptions } from "@p-doc/core";
import { clearMatches, findMatches, replaceMatches, showMatches, type DocMatch } from "../../editor/find.ts";
import { getEditor, focusEditor } from "../../session.ts";
import { app, toast } from "../../state.ts";

export function FindBar() {
  const mode = app.use((s) => s.find);
  if (!mode) return null;
  return <FindBarOpen mode={mode} />;
}

function FindBarOpen({ mode }: { mode: "find" | "replace" }) {
  app.use((s) => s.tick);
  const session = app.use((s) => s.session);
  const [query, setQuery] = useState(() => {
    const e = getEditor();
    if (!e) return "";
    const { from, to } = e.state.selection;
    const sel = e.state.doc.textBetween(from, to, " ");
    return sel && !sel.includes("\n") && sel.length < 200 ? sel : "";
  });
  const [replacement, setReplacement] = useState("");
  const [opts, setOpts] = useState<FindOptions>({ matchCase: false, wholeWord: false, regex: false });
  const [current, setCurrent] = useState(0);
  const result = useRef<{ doc: PMNode | null; key: string; matches: DocMatch[]; error: string | null }>({ doc: null, key: "", matches: [], error: null });
  const editor = getEditor();

  // Recompute matches only when the text or the query changes (showing them is itself a transaction).
  const key = `${session}\u0000${query}\u0000${opts.matchCase}${opts.wholeWord}${opts.regex}`;
  if (editor && (result.current.doc !== editor.state.doc || result.current.key !== key)) {
    const r = findMatches(editor.state.doc, query, opts);
    result.current = { doc: editor.state.doc, key, ...r };
  }
  const { matches, error } = result.current;
  const at = matches.length ? Math.min(current, matches.length - 1) : -1;

  useEffect(() => {
    const e = getEditor();
    if (!e) return;
    showMatches(e, matches, at, false);
  }, [matches, at]);

  useEffect(
    () => () => {
      const e = getEditor();
      if (e) clearMatches(e);
    },
    [],
  );

  const go = (dir: 1 | -1) => {
    if (!matches.length || !editor) return;
    const n = (at + dir + matches.length) % matches.length;
    setCurrent(n);
    showMatches(editor, matches, n, true);
  };

  const close = () => {
    app.set({ find: null });
    focusEditor();
  };

  const replaceOne = () => {
    if (!editor || at < 0) return;
    replaceMatches(editor, matches, replacement, opts, at);
  };
  const replaceAll = () => {
    if (!editor || !matches.length) return;
    const n = replaceMatches(editor, matches, replacement, opts);
    toast(n === 1 ? "Replaced 1 match" : `Replaced ${n} matches`);
  };

  const status = error ?? (!query ? "" : matches.length ? `${at + 1} of ${matches.length}` : "No results");
  const toggle = (k: keyof FindOptions, label: string, short: string) => (
    <button type="button" className={`chip${opts[k] ? " on" : ""}`} aria-pressed={!!opts[k]} title={label} aria-label={label} onClick={() => setOpts((o) => ({ ...o, [k]: !o[k] }))}>
      {short}
    </button>
  );

  return (
    <div
      className="findbar"
      role="search"
      aria-label={mode === "replace" ? "Find and replace" : "Find"}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="find-row">
        <input
          id="find-query"
          className="field"
          aria-label="Find in document"
          placeholder="Find in document"
          value={query}
          aria-invalid={!!error}
          onChange={(e) => {
            setQuery(e.target.value);
            setCurrent(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              go(e.shiftKey ? -1 : 1);
            }
          }}
        />
        <span className={`find-count${error ? " error" : ""}`} role="status" aria-live="polite">
          {status}
        </span>
        <button type="button" className="icon-btn" aria-label="Previous match (Shift+Enter)" title="Previous match (Shift+Enter)" disabled={!matches.length} onClick={() => go(-1)}>
          <ArrowUp16Regular />
        </button>
        <button type="button" className="icon-btn" aria-label="Next match (Enter)" title="Next match (Enter)" disabled={!matches.length} onClick={() => go(1)}>
          <ArrowDown16Regular />
        </button>
        <button type="button" className="icon-btn" aria-label="Close find (Esc)" title="Close (Esc)" onClick={close}>
          <Dismiss16Regular />
        </button>
      </div>
      <div className="find-row options">
        {toggle("matchCase", "Match case", "Aa")}
        {toggle("wholeWord", "Whole words", "ab|")}
        {toggle("regex", "Regular expressions", ".*")}
        {mode === "find" ? (
          <button type="button" className="btn subtle small" onClick={() => app.set({ find: "replace" })}>
            Replace…
          </button>
        ) : null}
      </div>
      {mode === "replace" ? (
        <div className="find-row">
          <input
            id="find-replace"
            className="field"
            aria-label="Replace with"
            placeholder="Replace with"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.ctrlKey) replaceAll();
                else replaceOne();
              }
            }}
          />
          <button type="button" className="btn small" disabled={at < 0} onClick={replaceOne}>
            Replace
          </button>
          <button type="button" className="btn small" disabled={!matches.length} onClick={replaceAll}>
            Replace all
          </button>
        </div>
      ) : null}
    </div>
  );
}
