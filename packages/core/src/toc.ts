/**
 * Keeps heading ids unique and every table of contents current, as a ProseMirror plugin: the TOC
 * never needs a manual refresh (improves on GD R-009 and W R-007).
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { TocEntry } from "./schema.ts";
import { newBookmarkId } from "./refs.ts";

export const TOC_LEVELS = 3;

function shortId(): string {
  return `h-${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

/** TOC entries from a ProseMirror document (headings 1 to `maxLevel`, 1–3 unless the contents' options say). */
export function tocEntriesOf(doc: PMNode, maxLevel = TOC_LEVELS): TocEntry[] {
  const out: TocEntry[] = [];
  doc.descendants((node) => {
    if (node.type.name === "heading") {
      const level = Number(node.attrs.level);
      if (level <= maxLevel) out.push({ id: String(node.attrs.id ?? ""), level, text: node.textContent.trim() });
      return false;
    }
    return node.type.name !== "tableOfContents";
  });
  return out;
}

const same = (a: TocEntry[], b: TocEntry[]) => a.length === b.length && a.every((e, i) => e.id === b[i]!.id && e.level === b[i]!.level && e.text === b[i]!.text);

/**
 * A transaction that gives headings and bookmarks unique ids (a pasted bookmark gets a new one) and refreshes
 * every TOC, or null when nothing changes.
 */
export function syncHeadingsAndToc(state: EditorState): Transaction | null {
  let tr: Transaction | null = null;
  const seen = new Set<string>();
  state.doc.descendants((node, pos) => {
    const name = node.type.name;
    if (name === "heading" || name === "bookmark") {
      const id = node.attrs.id as string | null;
      if (!id || seen.has(id)) {
        tr ??= state.tr;
        const fresh = name === "heading" ? shortId() : newBookmarkId();
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: fresh });
        seen.add(fresh);
      } else seen.add(id);
      return name === "heading";
    }
    return node.isBlock;
  });
  const doc = tr ? (tr as Transaction).doc : state.doc;
  const all = tocEntriesOf(doc, 6);
  doc.descendants((node, pos) => {
    if (node.type.name === "tableOfContents") {
      const levels = Number(node.attrs.levels ?? TOC_LEVELS);
      const entries = all.filter((e) => e.level <= levels);
      if (!same(node.attrs.entries ?? [], entries)) {
        tr ??= state.tr;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, entries });
      }
      return false;
    }
    return true;
  });
  if (tr) (tr as Transaction).setMeta("addToHistory", false).setMeta("pdoc-toc", true);
  return tr;
}

export const tocKey = new PluginKey("pdoc-toc");

export const TocSync = Extension.create({
  name: "tocSync",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tocKey,
        appendTransaction: (trs, _old, state) => (trs.some((t) => t.docChanged) ? syncHeadingsAndToc(state) : null),
      }),
    ];
  },
  onCreate() {
    const tr = syncHeadingsAndToc(this.editor.state);
    if (tr) this.editor.view.dispatch(tr);
  },
});
