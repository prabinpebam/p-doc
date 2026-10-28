/** Table operations beyond rows and columns (U60): equal column widths, and what the cells at the caret carry. */
import type { Editor } from "@tiptap/core";
import { CellSelection, TableMap } from "@tiptap/pm/tables";

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
