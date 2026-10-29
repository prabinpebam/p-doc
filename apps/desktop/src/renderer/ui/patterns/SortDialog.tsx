/** Format > Sort… (U50, spec §4.11): paragraphs, list items or a table's rows, A to Z or Z to A. */
import { Select } from "../primitives/Select.tsx";
import { useState } from "react";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import { sortCount, sortTarget, sortTransform } from "@p-doc/core";
import { getEditor } from "../../session.ts";
import { closeDialog } from "../../state.ts";
import { Dialog } from "../components/Dialog.tsx";

export function SortDialog() {
  const [target] = useState(() => {
    const e = getEditor();
    return e ? sortTarget(e.state.doc, e.state.selection.from, e.state.selection.to) : null;
  });
  const [descending, setDescending] = useState(false);
  const [column, setColumn] = useState(0);
  const [header, setHeader] = useState(target?.kind === "rows" && target.header);
  const e = getEditor();
  if (!e) return null;
  const count = target ? sortCount(e.state.doc, target, header) : 0;
  const what = !target ? "" : target.kind === "rows" ? `${count} table rows` : target.kind === "items" ? `${count} list items` : `${count} paragraphs`;
  const apply = () => {
    closeDialog();
    if (!target || count < 2) return e.view.focus();
    const { state } = e;
    const { tr: sorted, from, to } = sortTransform(state.doc, target, { descending, column, header });
    if (sorted.steps.length) {
      const tr = state.tr;
      for (const step of sorted.steps) tr.step(step);
      const sel = target.kind === "rows" ? TextSelection.near(tr.doc.resolve(from + 1)) : TextSelection.between(tr.doc.resolve(from + 1), tr.doc.resolve(to - 1), -1);
      // Its own step: Undo returns the order it had, never more.
      e.view.dispatch(closeHistory(tr.setSelection(sel).scrollIntoView()));
    }
    e.view.focus();
  };
  return (
    <Dialog
      title="Sort"
      onClose={closeDialog}
      onSubmit={apply}
      actions={
        <>
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={count < 2}>
            Sort
          </button>
        </>
      }
    >
      {!target ? (
        <p>Select two or more paragraphs or list items, or put the cursor in a list or table, to sort them.</p>
      ) : (
        <>
          <p>
            Sorts {what}. Numbers come first, in number order.
          </p>
          {target.kind === "rows" && (
            <>
              <label className="form-row">
                <span>By column</span>
                <Select name="sort-column" data-autofocus value={column} onValueChange={(ev) => setColumn(Number(ev))}>
                  {target.columns.map((c, i) => (
                    <option key={i} value={i}>
                      {c}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="check">
                <input type="checkbox" name="sort-header" checked={header} onChange={(ev) => setHeader(ev.target.checked)} />
                Header row (stays first)
              </label>
            </>
          )}
          <div role="radiogroup" aria-label="Order" className="radio-row">
            <label className="radio">
              <input type="radio" name="sort-order" data-autofocus={target.kind !== "rows" || undefined} checked={!descending} onChange={() => setDescending(false)} />A to Z
            </label>
            <label className="radio">
              <input type="radio" name="sort-order" checked={descending} onChange={() => setDescending(true)} />Z to A
            </label>
          </div>
        </>
      )}
    </Dialog>
  );
}
