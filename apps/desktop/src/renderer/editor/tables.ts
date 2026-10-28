/** Table operations beyond rows and columns (U60): equal column widths, and what the cells at the caret carry. */
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { CellSelection, selectedRect, TableMap } from "@tiptap/pm/tables";

/** Cell shading: light enough that black text keeps its contrast, as in Docs and Word. */
export const SHADES: [string, string][] = [
  ["Light grey", "#f1f3f4"],
  ["Grey", "#d9d9d9"],
  ["Light blue", "#cfe2f3"],
  ["Light green", "#d9ead3"],
  ["Light yellow", "#fff2cc"],
  ["Light orange", "#fce5cd"],
  ["Light red", "#f4cccc"],
  ["Light purple", "#d9d2e9"],
];

function tableAt(editor: Editor): { pos: number; node: import("@tiptap/pm/model").Node } | null {
  const $from = editor.state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === "table") return { pos: $from.before(d), node };
  }
  return null;
}

/** The value of a cell attribute at the caret, or on every selected cell if they agree. */
export function cellAttr(editor: Editor, name: string): unknown {
  const sel = editor.state.selection;
  const values = new Set<unknown>();
  if (sel instanceof CellSelection) sel.forEachCell((c) => void values.add(c.attrs[name] ?? null));
  else {
    const $from = sel.$from;
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d);
      if (n.type.name === "tableCell" || n.type.name === "tableHeader") {
        values.add(n.attrs[name] ?? null);
        break;
      }
    }
  }
  return values.size === 1 ? [...values][0] : undefined;
}

/** Whether the table's first row is a header row (repeated on each page it continues on). */
export function hasHeaderRow(editor: Editor): boolean {
  const t = tableAt(editor);
  const first = t?.node.firstChild;
  return !!first && first.childCount > 0 && [...Array(first.childCount).keys()].every((i) => first.child(i).type.name === "tableHeader");
}

/** Gives every column of the table at the caret the same width, filling the width it has now: one Undo step. */
export function distributeColumns(editor: Editor): boolean {
  const t = tableAt(editor);
  if (!t) return false;
  const dom = editor.view.nodeDOM(t.pos) as HTMLElement | null;
  const table = dom && (dom.matches("table") ? dom : dom.querySelector("table"));
  if (!table) return false;
  const cols = TableMap.get(t.node).width;
  const each = Math.max(32, Math.floor((table as HTMLElement).offsetWidth / cols));
  const tr = editor.state.tr;
  t.node.descendants((n, off) => {
    if (n.type.name !== "tableCell" && n.type.name !== "tableHeader") return true;
    tr.setNodeMarkup(t.pos + 1 + off, undefined, { ...n.attrs, colwidth: Array(Number(n.attrs.colspan ?? 1)).fill(each) });
    return false;
  });
  editor.view.dispatch(tr);
  return true;
}

/** Table properties (U60): the selected columns' width (px, null for automatic) and the selected cells' border and padding. */
export interface CellProps {
  width: number | null;
  borderWidth: number | null;
  borderColor: string | null;
  padding: number | null;
}

export const BORDER_WIDTHS: [number, string][] = [
  [0, "None"],
  [0.5, "½ pt"],
  [1, "1 pt"],
  [1.5, "1½ pt"],
  [2.25, "2¼ pt"],
  [3, "3 pt"],
];
export const BORDER_COLOURS: [string, string][] = [
  ["#000000", "Black"],
  ["#999999", "Grey"],
  ["#1a73e8", "Blue"],
  ["#188038", "Green"],
  ["#c5221f", "Red"],
];

/** What the dialog starts with: the values the selected cells share (null where they differ or are unset). */
export function cellProps(editor: Editor): CellProps {
  const v = (name: string) => (cellAttr(editor, name) ?? null) as never;
  const rect = selectedRect(editor.state);
  let width: number | null = null;
  const at = rect.map.map[rect.top * rect.map.width + rect.left]!;
  const cell = rect.table.nodeAt(at);
  const w = cell?.attrs.colwidth as number[] | null;
  if (w) width = w[rect.left - rect.map.colCount(at)] ?? null;
  return { width, borderWidth: v("borderWidth"), borderColor: v("borderColor"), padding: v("padding") };
}

/** Sets the selected columns' width and the selected cells' border and padding, as one Undo step. */
export function applyCellProps(editor: Editor, p: CellProps): void {
  const { state } = editor;
  const rect = selectedRect(state);
  const { map, table, tableStart } = rect;
  const tr = state.tr;
  const inRect = new Set(map.cellsInRect(rect));
  const done = new Set<number>();
  for (const at of map.map) {
    if (done.has(at)) continue;
    done.add(at);
    const node = table.nodeAt(at)!;
    const attrs = { ...node.attrs };
    const col = map.colCount(at);
    const span = Number(attrs.colspan ?? 1);
    const touches = col < rect.right && col + span > rect.left;
    if (touches) {
      const widths = Array.from({ length: span }, (_, i) => ((attrs.colwidth as number[] | null)?.[i] ?? 0) as number);
      for (let i = 0; i < span; i++) if (col + i >= rect.left && col + i < rect.right) widths[i] = p.width ?? 0;
      attrs.colwidth = widths.every((x) => x > 0) ? widths : null;
    }
    if (inRect.has(at)) Object.assign(attrs, { borderWidth: p.borderWidth, borderColor: p.borderWidth ? p.borderColor : null, padding: p.padding });
    tr.setNodeMarkup(tableStart + at, undefined, attrs);
  }
  if (tr.docChanged) editor.view.dispatch(closeHistory(tr));
}