/** List formats, start numbers and nesting (U43). */
import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { cleanListFormat, cleanStart, defaultListFormat, MAX_LIST_DEPTH, type ListFormat, type ListKind } from "@p-doc/core";

const LISTS = new Set(["bulletList", "orderedList", "taskList"]);

/** How many lists the cursor is inside. */
export function listDepth($pos: ResolvedPos): number {
  let n = 0;
  for (let d = $pos.depth; d > 0; d--) if (LISTS.has($pos.node(d).type.name)) n++;
  return n;
}

/** Tab doesn't nest past the ninth level (its own shortcut runs before the list's). */
export const ListLimit = Extension.create({
  name: "listLimit",
  priority: 1000,
  addKeyboardShortcuts() {
    return { Tab: () => atDeepest(this.editor) };
  },
});

/** In a list item already nine levels deep: nesting further does nothing. */
export function atDeepest(editor: Editor): boolean {
  return (editor.isActive("listItem") || editor.isActive("taskItem")) && listDepth(editor.state.selection.$from) >= MAX_LIST_DEPTH;
}

/** The numbered list around the cursor, and the item the cursor is in. */
function orderedAt(editor: Editor): { list: PMNode; pos: number; index: number; $list: ResolvedPos } | null {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (n.type.name === "orderedList") return { list: n, pos: $from.before(d), index: $from.index(d), $list: editor.state.doc.resolve($from.before(d)) };
    if (LISTS.has(n.type.name)) return null;
  }
  return null;
}

/** The numbered list before this one at the same level, and whether nothing stands between them. */
function previousOrdered(editor: Editor): { list: PMNode; pos: number; adjacent: boolean } | null {
  const at = orderedAt(editor);
  if (!at) return null;
  const parent = at.$list.parent;
  let pos = at.pos;
  for (let i = at.$list.index() - 1; i >= 0; i--) {
    const n = parent.child(i);
    pos -= n.nodeSize;
    if (n.type.name === "orderedList") return { list: n, pos, adjacent: i === at.$list.index() - 1 };
  }
  return null;
}

export const canRestart = (editor: Editor) => !!orderedAt(editor);
export const canContinue = (editor: Editor) => !!previousOrdered(editor);

/** Numbering starts again at 1 from the cursor's item: the list splits there if it must. */
export function restartNumbering(editor: Editor): void {
  const at = orderedAt(editor);
  if (!at) return;
  const tr = closeHistory(editor.state.tr);
  if (at.index === 0) tr.setNodeMarkup(at.pos, undefined, { ...at.list.attrs, start: 1 });
  else {
    let itemPos = at.pos + 1;
    for (let i = 0; i < at.index; i++) itemPos += at.list.child(i).nodeSize;
    tr.split(itemPos, 1, [{ type: at.list.type, attrs: { ...at.list.attrs, start: 1 } }]);
  }
  editor.view.dispatch(tr.scrollIntoView());
}

/** This list carries on from the numbered list before it (joined to it when they touch). */
export function continueNumbering(editor: Editor): void {
  const at = orderedAt(editor);
  const prev = previousOrdered(editor);
  if (!at || !prev) return;
  const tr = closeHistory(editor.state.tr);
  if (prev.adjacent) tr.join(at.pos);
  else tr.setNodeMarkup(at.pos, undefined, { ...at.list.attrs, start: cleanStart(prev.list.attrs.start) + prev.list.childCount });
  editor.view.dispatch(tr.scrollIntoView());
}

export interface ListLevel {
  kind: ListKind;
  format: ListFormat;
  start: number;
}

/** The outermost bulleted or numbered list around the cursor. */
function outerList(editor: Editor): { node: PMNode; pos: number } | null {
  const { $from } = editor.state.selection;
  for (let d = 1; d <= $from.depth; d++) {
    const n = $from.node(d);
    if (n.type.name === "orderedList" || n.type.name === "bulletList") return { node: n, pos: $from.before(d) };
  }
  return null;
}

/** Each list inside `node` (itself included) with its level, in document order. */
function eachList(node: PMNode, pos: number, fn: (n: PMNode, pos: number, level: number) => void, level = 0): void {
  if (node.type.name === "orderedList" || node.type.name === "bulletList") fn(node, pos, level);
  const next = LISTS.has(node.type.name) ? level + 1 : level;
  node.forEach((child, offset) => eachList(child, pos + 1 + offset, fn, next));
}

/** The levels of the list at the cursor: each level's kind, format and start (the first list there decides). */
export function listLevels(editor: Editor): ListLevel[] {
  const outer = outerList(editor);
  if (!outer) return [];
  const out: ListLevel[] = [];
  eachList(outer.node, outer.pos, (n, _pos, level) => {
    if (level >= MAX_LIST_DEPTH || out[level]) return;
    const kind = n.type.name as ListKind;
    out[level] = { kind, format: cleanListFormat(kind, n.attrs.listFormat) ?? defaultListFormat(kind, level), start: kind === "orderedList" ? cleanStart(n.attrs.start) : 1 };
  });
  // A level only nested lists of the other kind reach stays as it is.
  return Array.from({ length: out.length }, (_, i) => out[i] ?? { kind: "bulletList", format: defaultListFormat("bulletList", i), start: 1 });
}

/** Sets each level's format and start on every list at that level, as one Undo step. */
export function setListLevels(editor: Editor, levels: ListLevel[]): void {
  const outer = outerList(editor);
  if (!outer) return;
  const tr = closeHistory(editor.state.tr);
  eachList(outer.node, outer.pos, (n, pos, level) => {
    const l = levels[level];
    if (!l || l.kind !== n.type.name) return;
    const format = l.format === defaultListFormat(l.kind, level) ? null : l.format;
    const attrs = { ...n.attrs, listFormat: format, ...(l.kind === "orderedList" ? { start: cleanStart(l.start), type: null } : {}) };
    if (JSON.stringify(attrs) !== JSON.stringify(n.attrs)) tr.setNodeMarkup(pos, undefined, attrs);
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}
