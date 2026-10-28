/** The left panel (V3): Library and Outline tabs. */
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  Add20Regular,
  ChevronDown16Regular,
  ChevronRight16Regular,
  Delete20Regular,
  Globe16Regular,
  LockClosed16Regular,
  MoreHorizontal20Regular,
  ArrowReset20Regular,
} from "@fluentui/react-icons";
import { sectionRange, visibleOutline, type OutlineItem } from "@p-doc/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { sameRef, type DocSummary } from "../../shared/api.ts";
import { cursorBlockIndex, jumpToBlock, moveHeadingSection } from "../editor/blocks.ts";
import { copyDoc, deleteDoc, restoreDoc, showInFolder } from "../ops.ts";
import { focusEditor, getEditor, newDoc, openDoc } from "../session.ts";
import { app, openDialog, shownPanel, updateSettings } from "../state.ts";
import { unsynced } from "../sync.ts";
import { MenuList, useOutside, type MenuItemSpec } from "./Menu.tsx";

export function edited(iso: string, now = new Date()): string {
  const t = new Date(iso);
  const mins = Math.round((now.getTime() - t.getTime()) / 60000);
  if (mins < 1) return "Edited just now";
  if (mins < 60) return `Edited ${mins} min ago`;
  if (t.toDateString() === now.toDateString()) return `Edited ${t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  return `Edited ${t.toLocaleDateString(undefined, { day: "numeric", month: "short", year: t.getFullYear() === now.getFullYear() ? undefined : "numeric" })}`;
}

export function LeftPanel() {
  const panel = app.use(shownPanel);
  const overlay = app.use((s) => s.narrow);
  useEffect(() => {
    if (!overlay) return;
    // Over the page in a narrow window: a press on the page puts it away.
    const fn = (e: PointerEvent) => {
      if ((e.target as Element).closest?.(".canvas")) app.set({ peek: false });
    };
    document.addEventListener("pointerdown", fn, true);
    return () => document.removeEventListener("pointerdown", fn, true);
  }, [overlay]);
  if (!panel) return null;
  const tab = (t: "library" | "outline", label: string) => (
    <button
      type="button"
      role="tab"
      id={`tab-${t}`}
      aria-selected={panel === t}
      aria-controls={`panel-${t}`}
      tabIndex={panel === t ? 0 : -1}
      className="tab"
      onClick={() => void updateSettings({ leftPanel: t })}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const next = t === "library" ? "outline" : "library";
          void updateSettings({ leftPanel: next });
          requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
        }
      }}
    >
      {label}
    </button>
  );
  return (
    <aside
      className={`left-panel${overlay ? " overlay" : ""}`}
      aria-label="Side panel"
      data-region
      onKeyDown={(e) => {
        if (overlay && e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          app.set({ peek: false });
          focusEditor();
        }
      }}
    >
      <div role="tablist" aria-label="Side panel" className="tabs">
        {tab("library", "Library")}
        {tab("outline", "Outline")}
      </div>
      <div role="tabpanel" id={`panel-${panel}`} aria-labelledby={`tab-${panel}`} className="tabpanel">
        {panel === "library" ? <Library /> : <Outline />}
      </div>
    </aside>
  );
}

function RowMenu({ d }: { d: DocSummary }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, open, () => setOpen(false));
  const items: MenuItemSpec[] = d.bin
    ? [
        { key: "restore", label: "Restore", run: () => void restoreDoc(d) },
        { key: "show", label: "Show in folder", run: () => showInFolder(d) },
      ]
    : [
        { key: "open", label: "Open", run: () => void openDoc(d) },
        { key: "rename", label: "Rename", run: () => openDialog({ kind: "rename", ref: d, title: d.title }) },
        { key: "copy", label: "Make a copy", run: () => void copyDoc(d) },
        {
          key: "move",
          label: d.space === "private" ? "Move to Public" : "Move to Private",
          run: () => openDialog({ kind: "move", ref: d, title: d.title, to: d.space === "private" ? "public" : "private" }),
        },
        { key: "show", label: "Show in folder", run: () => showInFolder(d) },
        { key: "sep", label: "", separator: true },
        { key: "delete", label: "Delete", danger: true, run: () => void deleteDoc(d) },
      ];
  return (
    <div ref={ref} className="row-menu">
      <button type="button" className="icon-btn" aria-label={`More actions for ${d.title}`} title="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal20Regular />
      </button>
      {open ? (
        <MenuList
          items={items}
          label={`Actions for ${d.title}`}
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

function DocRow({ d, current }: { d: DocSummary; current: boolean }) {
  const waiting = app.use((s) => !d.bin && !!s.settings?.github?.connected && unsynced(s.sync, d));
  return (
    <li className={`doc-row${current ? " current" : ""}`}>
      {d.bin ? (
        <div className="doc-open static">
          <span className="doc-title">{d.title}</span>
          <span className="doc-meta">{edited(d.modified)}</span>
        </div>
      ) : (
        <button type="button" className="doc-open" aria-current={current ? "page" : undefined} onClick={() => void openDoc(d)}>
          <span className="doc-title">{d.title}</span>
          <span className="doc-meta">
            {edited(d.modified)}
            {waiting ? " · Not synced yet" : ""}
          </span>
        </button>
      )}
      {d.bin ? (
        <button type="button" className="icon-btn" aria-label={`Restore ${d.title}`} title="Restore" onClick={() => void restoreDoc(d)}>
          <ArrowReset20Regular />
        </button>
      ) : null}
      <RowMenu d={d} />
    </li>
  );
}

function Library() {
  const docs = app.use((s) => s.docs);
  const current = app.use((s) => s.current);
  const [q, setQ] = useState("");
  const [binOpen, setBinOpen] = useState(false);
  const match = (d: DocSummary) => !q.trim() || d.title.toLowerCase().includes(q.trim().toLowerCase());
  const live = docs.filter((d) => !d.bin && match(d));
  const bin = docs.filter((d) => d.bin && match(d));
  const section = (space: "private" | "public", label: string, icon: ReactNode) => {
    const rows = live.filter((d) => d.space === space);
    return (
      <section className="lib-section" aria-labelledby={`lib-${space}`}>
        <h3 id={`lib-${space}`} className="lib-heading">
          {icon}
          {label}
          <span className="lib-count">{rows.length}</span>
        </h3>
        {rows.length ? (
          <ul className="doc-list" aria-labelledby={`lib-${space}`}>
            {rows.map((d) => (
              <DocRow key={d.path} d={d} current={sameRef(current, d)} />
            ))}
          </ul>
        ) : (
          <p className="empty">{q.trim() ? "No documents match." : space === "public" ? "Nothing public. Documents here are readable by anyone on GitHub." : "No documents yet."}</p>
        )}
      </section>
    );
  };
  return (
    <div className="library">
      <div className="lib-top">
        <input id="library-search" type="search" className="field" placeholder="Search documents" aria-label="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn primary" onClick={() => void newDoc()}>
          <Add20Regular aria-hidden /> New
        </button>
      </div>
      <div className="lib-scroll">
        {section("private", "Private", <LockClosed16Regular aria-hidden />)}
        {section("public", "Public", <Globe16Regular aria-hidden />)}
        <section className="lib-section" aria-label="Bin">
          <button type="button" className="lib-heading toggle" aria-expanded={binOpen} onClick={() => setBinOpen((o) => !o)}>
            {binOpen ? <ChevronDown16Regular aria-hidden /> : <ChevronRight16Regular aria-hidden />}
            <Delete20Regular aria-hidden />
            Bin
            <span className="lib-count">{bin.length}</span>
          </button>
          {binOpen ? (
            bin.length ? (
              <ul className="doc-list">
                {bin.map((d) => (
                  <DocRow key={`${d.space}/${d.path}`} d={d} current={false} />
                ))}
              </ul>
            ) : (
              <p className="empty">The Bin is empty.</p>
            )
          ) : null}
        </section>
      </div>
    </div>
  );
}

function outlineOf(doc: PMNode): OutlineItem[] {
  const hs: { index: number; level: number; text: string; id: string | null }[] = [];
  doc.forEach((b, _o, index) => {
    if (b.type.name === "heading") hs.push({ index, level: Number(b.attrs.level), text: b.textContent.trim(), id: (b.attrs.id as string) ?? null });
  });
  return hs.map((h, i) => ({ ...h, hasChildren: i + 1 < hs.length && hs[i + 1]!.level > h.level }));
}

function Outline() {
  app.use((s) => s.tick);
  app.use((s) => s.session);
  const editor = getEditor();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null);
  const items = editor ? outlineOf(editor.state.doc) : [];
  const collapsedIdx = useMemo(() => new Set(items.filter((i) => i.id && collapsed.has(i.id)).map((i) => i.index)), [items, collapsed]);
  const rows = visibleOutline(items, collapsedIdx);
  const cursor = editor ? cursorBlockIndex(editor) : -1;
  const active = [...items].reverse().find((i) => i.index <= cursor)?.index ?? null;

  if (!editor) return null;
  if (!items.length) return <p className="empty">Headings you add appear here.</p>;

  const levels = () => {
    const out: (number | null)[] = [];
    editor.state.doc.forEach((b) => out.push(b.type.name === "heading" ? Number(b.attrs.level) : null));
    return out;
  };
  /** Moves a section past its previous or next sibling heading (Alt+Shift+Up/Down). */
  const nudge = (it: OutlineItem, dir: -1 | 1) => {
    const ls = levels();
    const [start, end] = sectionRange(ls, it.index);
    if (dir < 0) {
      const prev = [...items].reverse().find((h) => h.index < start && h.level <= it.level);
      if (prev && prev.level === it.level) moveHeadingSection(editor, it.index, prev.index);
    } else {
      const next = items.find((h) => h.index >= end && h.level <= it.level);
      if (next && next.level === it.level) moveHeadingSection(editor, it.index, sectionRange(ls, next.index)[1]);
    }
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`.outline-row[data-id="${it.id}"] .outline-text`)?.focus());
  };

  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (drag) moveHeadingSection(editor, drag.from, to);
    setDrag(null);
  };

  return (
    <ul className="outline" aria-label="Outline">
      {rows.map((it) => {
        const isCollapsed = !!it.id && collapsed.has(it.id);
        return (
          <li
            key={it.id ?? it.index}
            data-id={it.id ?? undefined}
            className={`outline-row lvl-${it.level}${drag?.over === it.index ? " drop-before" : ""}${drag?.from === it.index ? " dragging" : ""}`}
            aria-current={active === it.index ? "location" : undefined}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", it.text);
              setDrag({ from: it.index, over: null });
            }}
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              if (drag.over !== it.index) setDrag({ ...drag, over: it.index });
            }}
            onDragEnd={() => setDrag(null)}
            onDrop={(e) => onDrop(e, it.index)}
          >
            {it.hasChildren ? (
              <button
                type="button"
                className="icon-btn tiny"
                aria-label={isCollapsed ? `Expand ${it.text || "heading"}` : `Collapse ${it.text || "heading"}`}
                aria-expanded={!isCollapsed}
                onClick={() =>
                  setCollapsed((c) => {
                    const n = new Set(c);
                    if (it.id) {
                      if (n.has(it.id)) n.delete(it.id);
                      else n.add(it.id);
                    }
                    return n;
                  })
                }
              >
                {isCollapsed ? <ChevronRight16Regular /> : <ChevronDown16Regular />}
              </button>
            ) : (
              <span className="chev-space" aria-hidden />
            )}
            <button
              type="button"
              className="outline-text"
              title="Alt+Shift+Up or Down moves the section"
              onClick={() => jumpToBlock(editor, it.index)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.altKey && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                  e.preventDefault();
                  nudge(it, e.key === "ArrowUp" ? -1 : 1);
                }
              }}
            >
              {it.text || "Untitled heading"}
            </button>
          </li>
        );
      })}
      <li
        className={`outline-end${drag?.over === -1 ? " drop-before" : ""}`}
        aria-hidden
        onDragOver={(e) => {
          if (!drag) return;
          e.preventDefault();
          if (drag.over !== -1) setDrag({ ...drag, over: -1 });
        }}
        onDrop={(e) => onDrop(e, editor.state.doc.childCount)}
      />
    </ul>
  );
}
