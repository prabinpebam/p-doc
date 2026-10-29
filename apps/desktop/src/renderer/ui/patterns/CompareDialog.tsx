/** Tools > Compare documents… (U66): pick the original and the revised document. */
import { Select } from "../primitives/Select.tsx";
import { useState } from "react";
import type { DocRef } from "../../../shared/api.ts";
import { sameRef } from "../../../shared/api.ts";
import { compareInto, type CompareSide } from "../../compare.ts";
import { ipcMessage } from "../../session.ts";
import { app, closeDialog, toast } from "../../state.ts";
import { Dialog } from "../components/Dialog.tsx";

type Picked = { value: string; side: CompareSide; label: string };

const refValue = (r: DocRef) => `doc:${r.space}:${r.path}`;

export function CompareDialog() {
  const docs = app.use((s) => s.docs);
  const current = app.use((s) => s.current);
  const [files, setFiles] = useState<Picked[]>([]);
  const others = docs.filter((d) => !d.bin && !(current && sameRef(d, current)));
  const choices: Picked[] = [
    ...(current ? [{ value: "this", side: { kind: "this" } as CompareSide, label: `This document (${current.title || "Untitled"})` }] : []),
    ...others.map((d) => ({ value: refValue(d), side: { kind: "doc", ref: { space: d.space, path: d.path } } as CompareSide, label: d.title || "Untitled" })),
    ...files,
  ];
  const [original, setOriginal] = useState(() => (others[0] ? refValue(others[0]) : "this"));
  const [revised, setRevised] = useState("this");
  const [working, setWorking] = useState(false);

  const pick = async (set: (v: string) => void, value: string) => {
    if (value !== "file") return set(value);
    try {
      const f = await window.pdoc.output.readFile();
      if (!f) return;
      const v = `file:${files.length}`;
      setFiles((fs) => [...fs, { value: v, side: { kind: "file", title: f.title, content: f.content }, label: `${f.title || "Untitled"} (file)` }]);
      set(v);
    } catch (e) {
      toast(`Couldn't read the file: ${ipcMessage(e)}`, { tone: "error" });
    }
  };

  const a = choices.find((c) => c.value === original);
  const b = choices.find((c) => c.value === revised);
  const same = original === revised;
  const run = async () => {
    if (!a || !b || same || working) return;
    setWorking(true);
    if (await compareInto(a.side, b.side)) closeDialog();
    else setWorking(false);
  };

  const select = (name: string, value: string, set: (v: string) => void, autofocus?: boolean) => (
    <Select name={name} data-autofocus={autofocus || undefined} value={value} disabled={working} onValueChange={(ev) => void pick(set, ev)}>
      {choices.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
      <option value="file">A file…</option>
    </Select>
  );

  return (
    <Dialog
      title="Compare documents"
      onClose={closeDialog}
      onSubmit={() => void run()}
      actions={
        <>
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!a || !b || same || working}>
            {working ? "Comparing…" : "Compare"}
          </button>
        </>
      }
    >
      <p>Makes a new private document: the revised text, with every difference from the original as a suggestion.</p>
      <label className="form-row">
        <span>Original</span>
        {select("compare-original", original, setOriginal, true)}
      </label>
      <label className="form-row">
        <span>Revised</span>
        {select("compare-revised", revised, setRevised)}
      </label>
      {same && <p role="status">Pick two different documents.</p>}
    </Dialog>
  );
}
