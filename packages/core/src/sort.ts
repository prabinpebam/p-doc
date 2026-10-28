/** Sorting paragraphs, list items and table rows (U50, spec §4.11), as one undoable step. */
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import { sortOrder } from "./paragraph.ts";

const LISTS = ["bulletList", "orderedList", "taskList"];

/** What a sort at the selection would order. */
export type SortTarget =
  /** A table's rows; `pos` is the table's position, `columns` its column names. */
  | { kind: "rows"; pos: number; columns: string[]; header: boolean }
  /** A list's items `first` to `last`; `pos` is the list's position. */
  | { kind: "items"; pos: number; first: number; last: number }
  /** Top-level blocks `first` to `last`. */
  | { kind: "blocks"; first: number; last: number };

export interface SortOptions {
  descending?: boolean;
  /** The column table rows sort by (0 first). */
  column?: number;
  /** The table's first row is a header and stays first. */
  header?: boolean;
}

/**
 * What to sort for a selection: the rows of the table it's in; else the selected items of the list it's in
 * (all of them when the selection is in one item); else the blocks it covers. Null when fewer than two.
 */
export function sortTarget(doc: PMNode, from: number, to: number): SortTarget | null {
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (n.type.name !== "table") continue;
    const head = n.firstChild;
    const header = head?.firstChild?.type.name === "tableHeader";
    const columns = Array.from({ length: head?.childCount ?? 0 }, (_, i) => (header && head!.child(i).textContent.trim()) || `Column ${i + 1}`);
    return n.childCount - (header ? 1 : 0) >= 2 ? { kind: "rows", pos: $from.before(d), columns, header } : null;
  }
  for (let d = $from.sharedDepth(to); d > 0; d--) {
    const n = $from.node(d);
    if (!LISTS.includes(n.type.name)) continue;
    let first = $from.index(d);
    let last = $to.index(d);
    if (first === last) [first, last] = [0, n.childCount - 1];
    return last > first ? { kind: "items", pos: $from.before(d), first, last } : null;
  }
  const first = $from.index(0);
  const last = Math.min($to.index(0), doc.childCount - 1);
  return last > first ? { kind: "blocks", first, last } : null;
}

/** How many things a target sorts. */
export function sortCount(doc: PMNode, t: SortTarget, header = t.kind === "rows" && t.header): number {
  if (t.kind === "rows") return doc.nodeAt(t.pos)!.childCount - (header ? 1 : 0);
  return t.last - t.first + 1;
}

/**
 * The step that sorts a target: numbers in number order, then words; ties keep their order. Returns
 * the transform (no steps when already in order) and the range the sorted things fill.
 */
export function sortTransform(doc: PMNode, t: SortTarget, o: SortOptions = {}): { tr: Transform; from: number; to: number } {
  const tr = new Transform(doc);
  const parent = t.kind === "blocks" ? doc : doc.nodeAt(t.pos)!;
  const start = t.kind === "blocks" ? 0 : t.pos + 1;
  const header = t.kind === "rows" ? (o.header ?? t.header) : false;
  const first = t.kind === "rows" ? (header ? 1 : 0) : t.first;
  const last = t.kind === "rows" ? parent.childCount - 1 : t.last;
  let from = start;
  for (let i = 0; i < first; i++) from += parent.child(i).nodeSize;
  const kids: PMNode[] = [];
  for (let i = first; i <= last; i++) kids.push(parent.child(i));
  const to = kids.reduce((end, k) => end + k.nodeSize, from);
  const keys = kids.map((k) => (t.kind === "rows" ? (k.maybeChild(o.column ?? 0)?.textContent ?? "") : k.textContent));
  const order = sortOrder(keys, o.descending);
  if (order.some((v, i) => v !== i)) tr.replaceWith(from, to, Fragment.from(order.map((i) => kids[i]!)));
  return { tr, from, to };
}
