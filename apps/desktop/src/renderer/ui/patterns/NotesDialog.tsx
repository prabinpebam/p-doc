/** Format > Notes… (U51, spec §4.12): number formats for footnotes and endnotes, and converting them all. */
import { Select } from "../primitives/Select.tsx";
import { useState } from "react";
import { formatNumber, NOTE_FORMATS, type NoteFormat } from "@p-doc/core";
import { applyNoteOptions, noteOptions, type NoteOptions } from "../../editor/notes.ts";
import { getEditor } from "../../session.ts";
import { closeDialog } from "../../state.ts";
import { Dialog } from "../components/Dialog.tsx";

const sample = (f: NoteFormat) => [1, 2, 3].map((n) => formatNumber(n, f)).join(", ");

export function NotesDialog() {
  const [o, setO] = useState<NoteOptions>(() => {
    const e = getEditor();
    return e ? noteOptions(e.state) : { footFormat: "1", endFormat: "i", convert: null };
  });
  const e = getEditor();
  if (!e) return null;
  const apply = () => {
    closeDialog();
    applyNoteOptions(e, o);
    e.view.focus();
  };
  const select = (name: string, label: string, value: NoteFormat, set: (f: NoteFormat) => void, auto?: boolean) => (
    <label className="form-row">
      <span>{label}</span>
      <Select name={name} data-autofocus={auto || undefined} value={value} onValueChange={(ev) => set(ev as NoteFormat)}>
        {NOTE_FORMATS.map((f) => (
          <option key={f} value={f}>
            {sample(f)}
          </option>
        ))}
      </Select>
    </label>
  );
  return (
    <Dialog
      title="Notes"
      onClose={closeDialog}
      onSubmit={apply}
      actions={
        <>
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Apply
          </button>
        </>
      }
    >
      {select("foot-format", "Footnote numbers", o.footFormat, (f) => setO({ ...o, footFormat: f }), true)}
      {select("end-format", "Endnote numbers", o.endFormat, (f) => setO({ ...o, endFormat: f }))}
      <div role="radiogroup" aria-label="Convert">
        <label className="radio">
          <input type="radio" name="notes-convert" checked={o.convert === null} onChange={() => setO({ ...o, convert: null })} />
          Keep footnotes and endnotes as they are
        </label>
        <label className="radio">
          <input type="radio" name="notes-convert" checked={o.convert === "endnote"} onChange={() => setO({ ...o, convert: "endnote" })} />
          Make all footnotes endnotes
        </label>
        <label className="radio">
          <input type="radio" name="notes-convert" checked={o.convert === "footnote"} onChange={() => setO({ ...o, convert: "footnote" })} />
          Make all endnotes footnotes
        </label>
      </div>
    </Dialog>
  );
}
