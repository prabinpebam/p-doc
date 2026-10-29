/** Format > Lists > List options… (U43): each level's number format or bullet, and where numbering starts. */
import { Select } from "../primitives/Select.tsx";
import { useState } from "react";
import { BULLET_FORMATS, LIST_FORMAT_LABELS, NUMBER_FORMATS } from "@p-doc/core";
import { listLevels, setListLevels, type ListLevel } from "../../editor/lists.ts";
import { getEditor } from "../../session.ts";
import { closeDialog } from "../../state.ts";
import { Dialog } from "../components/Dialog.tsx";

export function ListOptionsDialog() {
  const [levels, setLevels] = useState<ListLevel[]>(() => {
    const e = getEditor();
    return e ? listLevels(e) : [];
  });
  const [starts, setStarts] = useState(() => levels.map((l) => String(l.start)));
  const e = getEditor();
  if (!e) return null;
  const bad = levels.map((l, i) => l.kind === "orderedList" && (!/^\d{1,5}$/.test(starts[i]!.trim()) || Number(starts[i]) > 32767));
  const anyBad = bad.some(Boolean);
  const apply = () => {
    if (anyBad) return;
    closeDialog();
    setListLevels(e, levels.map((l, i) => ({ ...l, start: Number(starts[i]) })));
    e.view.focus();
  };
  const setFormat = (i: number, format: ListLevel["format"]) => setLevels(levels.map((l, k) => (k === i ? { ...l, format } : l)));
  return (
    <Dialog
      title="List options"
      onClose={closeDialog}
      onSubmit={apply}
      actions={
        <>
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={anyBad}>
            Apply
          </button>
        </>
      }
    >
      {levels.map((l, i) => (
        <div key={i}>
          <div className="form-grid wide-first">
            <label className="form-row">
              <span>Level {i + 1}</span>
              <Select name={`list-format-${i + 1}`} value={l.format} onValueChange={(ev) => setFormat(i, ev as ListLevel["format"])} {...(i === 0 ? { "data-autofocus": true } : {})}>
                {(l.kind === "orderedList" ? NUMBER_FORMATS : BULLET_FORMATS).map((f) => (
                  <option key={f} value={f}>
                    {LIST_FORMAT_LABELS[f]}
                  </option>
                ))}
              </Select>
            </label>
            {l.kind === "orderedList" ? (
              <label className="form-row">
                <span>Start at</span>
                <input className="field" name={`list-start-${i + 1}`} inputMode="numeric" aria-label={`Level ${i + 1} start at`} value={starts[i]} onChange={(ev) => setStarts(starts.map((s, k) => (k === i ? ev.target.value : s)))} aria-invalid={bad[i] || undefined} />
              </label>
            ) : null}
          </div>
          {bad[i] ? <p className="form-error">Enter a whole number from 0 to 32767.</p> : null}
        </div>
      ))}
    </Dialog>
  );
}
