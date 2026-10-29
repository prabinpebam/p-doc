/** The version history panel (V6) and the version shown over the page (spec §4.6). */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { ArrowReset20Regular, Copy20Regular, Dismiss20Regular, MoreHorizontal20Regular } from "@fluentui/react-icons";
import { extensions, groupVersions, styleCss } from "@p-doc/core";
import type { VersionEntry } from "../../../shared/api.ts";
import { app } from "../../state.ts";
import { askRestore, backToCurrent, closeHistory, copyVersion, history, loadHistory, nameVersion, startNaming, versionTime, viewVersion, type Viewing } from "../../versions.ts";
import { MenuList, useOutside, type MenuItemSpec } from "../components/Menu.tsx";

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function NameField({ v }: { v: VersionEntry }) {
  const done = useRef(false);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    if (value == null) history.set({ naming: null });
    else void nameVersion(v.sha, value);
  };
  return (
    <input
      className="field version-name-field"
      aria-label="Version name"
      placeholder="Name this version"
      defaultValue={v.name ?? ""}
      maxLength={100}
      autoFocus
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(e.currentTarget.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish(null);
        }
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
}

function VersionMenu({ v, top }: { v: VersionEntry; top: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, open, () => setOpen(false));
  const label = top ? "the current version" : `the version from ${versionTime(v.time)}`;
  const items: MenuItemSpec[] = [
    { key: "name", label: v.name ? "Rename this version" : "Name this version", run: () => startNaming(v.sha) },
    ...(v.name ? [{ key: "unname", label: "Remove name", run: () => void nameVersion(v.sha, "") }] : []),
    ...(top ? [] : [{ key: "restore", label: "Restore this version", run: () => askRestore(v) }]),
    { key: "copy", label: "Make a copy", run: () => void copyVersion(v) },
  ];
  return (
    <div ref={ref} className="row-menu">
      <button type="button" className="icon-btn" aria-label={`More actions for ${label}`} title="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
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

function VersionRow({ v, top, selected }: { v: VersionEntry; top: boolean; selected: boolean }) {
  const naming = history.use((s) => s.naming === v.sha);
  const opening = history.use((s) => s.opening === v.sha);
  return (
    <li className={`doc-row version-row${selected ? " current" : ""}`} data-testid="version-row" data-sha={v.sha}>
      {naming ? (
        <div className="doc-open static">
          <NameField v={v} />
          <span className="doc-meta">{top ? `Current version · ${clock(v.time)}` : clock(v.time)}</span>
        </div>
      ) : (
        <button type="button" className="doc-open" aria-current={selected || undefined} aria-busy={opening || undefined} onClick={() => void viewVersion(v)}>
          {v.name ? <span className="doc-title version-name">{v.name}</span> : null}
          <span className={v.name ? "doc-meta" : "doc-title"}>{top ? `Current version · ${clock(v.time)}` : clock(v.time)}</span>
          <span className="doc-meta">{v.author}</span>
        </button>
      )}
      <VersionMenu v={v} top={top} />
    </li>
  );
}

export function HistoryPanel() {
  const current = app.use((s) => s.current);
  const gitOn = app.use((s) => !!s.info?.git);
  const list = history.use((s) => s.list);
  const onlyNamed = history.use((s) => s.onlyNamed);
  const viewing = history.use((s) => s.viewing);
  const error = history.use((s) => s.error);
  const space = current?.space;
  const path = current?.path;

  useEffect(() => {
    backToCurrent();
    void loadHistory(true);
  }, [space, path]);

  const groups = useMemo(() => (list ? groupVersions(list, new Date(), navigator.language, onlyNamed) : []), [list, onlyNamed]);
  const top = list?.[0]?.sha;

  let body;
  if (!gitOn) body = <p className="empty">Install Git to keep versions.</p>;
  else if (list === null)
    body = (
      <ul className="doc-list" aria-busy="true" aria-label="Loading versions">
        {[0, 1, 2].map((i) => (
          <li key={i} className="skeleton-row" />
        ))}
      </ul>
    );
  else if (error) body = <p className="form-error panel-note">Couldn't read the versions: {error}</p>;
  else if (!groups.length) body = <p className="empty">{onlyNamed ? "No named versions yet. Name one from its menu." : "No earlier versions yet. Versions are made as you write."}</p>;
  else
    body = (
      <>
        {groups.map((g) => (
          <section key={g.label} className="lib-section" aria-label={g.label}>
            <h3 className="lib-heading">{g.label}</h3>
            <ul className="doc-list">
              {g.versions.map((v) => (
                <VersionRow key={v.sha} v={v} top={v.sha === top} selected={viewing ? viewing.entry.sha === v.sha : v.sha === top} />
              ))}
            </ul>
          </section>
        ))}
        {!onlyNamed && list.length === 1 ? <p className="empty">No earlier versions yet. Versions are made as you write.</p> : null}
      </>
    );

  return (
    <aside
      id="history-panel"
      className="right-panel"
      aria-label="Version history"
      data-region
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          if (history.get().viewing) backToCurrent();
          else closeHistory();
        }
      }}
    >
      <div className="panel-head">
        <h2 className="panel-title">Version history</h2>
        <button type="button" className="icon-btn" aria-label="Close version history" title="Close (Esc)" onClick={closeHistory} data-autofocus>
          <Dismiss20Regular />
        </button>
      </div>
      <label className="check panel-filter">
        <input type="checkbox" checked={onlyNamed} onChange={(e) => history.set({ onlyNamed: e.target.checked })} />
        Only named versions
      </label>
      <div className="lib-scroll">{body}</div>
    </aside>
  );
}

function VersionText({ viewing }: { viewing: Viewing }) {
  const editor = useEditor(
    {
      extensions: extensions(),
      content: viewing.content,
      editable: false,
      immediatelyRender: true,
      editorProps: { attributes: { class: "pd-content", "aria-label": "Version text", "aria-readonly": "true" } },
    },
    [viewing],
  );
  return <EditorContent editor={editor} className="pd-editor" />;
}

/** The version over the page, read-only, with what changed since it marked (U29). */
export function VersionView({ viewing, style, zoom }: { viewing: Viewing; style: CSSProperties; zoom: number }) {
  const time = versionTime(viewing.entry.time);
  const changes =
    viewing.added || viewing.removed
      ? `Since then: ${viewing.added.toLocaleString()} ${viewing.added === 1 ? "word" : "words"} added, ${viewing.removed.toLocaleString()} removed.`
      : "The text is the same as now.";
  return (
    <div className="version-view" data-testid="version-view">
      <div className="version-banner" role="status">
        <div className="version-banner-text">
          <strong>
            Viewing the version from {time}
            {viewing.entry.name ? ` (${viewing.entry.name})` : ""}.
          </strong>
          <span className="muted small">
            {changes} <ins className="pd-insertion" data-id="diff">Added since</ins> <del className="pd-deletion" data-id="diff">Removed since</del>
          </span>
        </div>
        <div className="version-banner-actions">
          <button type="button" className="btn primary" onClick={() => askRestore(viewing.entry)}>
            <ArrowReset20Regular aria-hidden /> Restore this version
          </button>
          <button type="button" className="btn" onClick={() => void copyVersion(viewing.entry)}>
            <Copy20Regular aria-hidden /> Make a copy
          </button>
          <button type="button" className="btn subtle" onClick={backToCurrent}>
            Back to current
          </button>
        </div>
      </div>
      <div className="page-scroll">
        <style>{styleCss(viewing.doc.styles, ".version-page .pd-content")}</style>
        <div className="page-stack" style={{ zoom: zoom / 100 }}>
          <article className="page pageless version-page" style={style} data-testid="version-page">
            <VersionText viewing={viewing} />
          </article>
        </div>
      </div>
    </div>
  );
}
