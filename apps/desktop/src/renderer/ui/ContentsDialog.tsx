/** Contents options (U54, spec §4.12): how many heading levels the contents list, and page numbers or links. */
import { useState } from "react";
import { contentsAt, setContentsOptions, type ContentsShow } from "../editor/refs.ts";
import { getEditor } from "../session.ts";
import { closeDialog } from "../state.ts";
import { Dialog } from "./Dialog.tsx";

const LEVELS = [1, 2, 3, 4, 5, 6];

export function ContentsDialog() {
  const e = getEditor();
  const [o, setO] = useState(() => (e ? contentsAt(e.state) : null));
  if (!e || !o) return null;
  const apply = () => {
    closeDialog();
    setContentsOptions(e, o.levels, o.show);
  };
  const radio = (show: ContentsShow, label: string) => (
    <label className="radio">
      <input type="radio" name="contents-show" checked={o.show === show} onChange={() => setO({ ...o, show })} />
      {label}
    </label>
  );
  return (
    <Dialog
      title="Contents options"
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
      <label className="form-row">
        <span>Levels</span>
        <select className="field" data-autofocus value={o.levels} onChange={(ev) => setO({ ...o, levels: Number(ev.target.value) })}>
          {LEVELS.map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "1" : `1–${n}`}
            </option>
          ))}
        </select>
      </label>
      <div role="radiogroup" aria-label="Show">
        {radio("pages", "Page numbers")}
        {radio("links", "Links")}
      </div>
      <p className="muted">In Pageless view the contents always show links.</p>
    </Dialog>
  );
}
