/** Format > Table > Table properties… (U60): the selected columns' width, and the selected cells' border and padding. */
import { Select } from "../primitives/Select.tsx";
import { useState } from "react";
import { applyCellProps, BORDER_COLOURS, BORDER_WIDTHS, cellProps, type CellProps } from "../../editor/tables.ts";
import { getEditor } from "../../session.ts";
import { closeDialog } from "../../state.ts";
import { Dialog } from "../components/Dialog.tsx";

const PX_PER_IN = 96;
const inches = (px: number | null) => (px ? String(Math.round((px / PX_PER_IN) * 100) / 100) : "");

export function TableDialog() {
  const [p, setP] = useState<CellProps>(() => {
    const e = getEditor();
    return e ? cellProps(e) : { width: null, borderWidth: null, borderColor: null, padding: null };
  });
  const [width, setWidth] = useState(() => inches(p.width));
  const [padding, setPadding] = useState(() => (p.padding == null ? "" : String(p.padding)));
  const e = getEditor();
  if (!e) return null;
  const w = width.trim() === "" ? null : Number(width);
  const pad = padding.trim() === "" ? null : Number(padding);
  const widthBad = w != null && !(w >= 0.3 && w <= 22);
  const padBad = pad != null && !(pad >= 0 && pad <= 72);
  const apply = () => {
    if (widthBad || padBad) return;
    closeDialog();
    applyCellProps(e, { ...p, width: w == null ? null : Math.round(w * PX_PER_IN), padding: pad });
    e.view.focus();
  };
  return (
    <Dialog
      title="Table properties"
      onClose={closeDialog}
      onSubmit={apply}
      actions={
        <>
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={widthBad || padBad}>
            Apply
          </button>
        </>
      }
    >
      <label className="form-row">
        <span>Column width (in)</span>
        <input className="field" name="table-width" inputMode="decimal" placeholder="Automatic" data-autofocus value={width} onChange={(ev) => setWidth(ev.target.value)} aria-invalid={widthBad || undefined} />
      </label>
      {widthBad ? <p className="form-error">Enter a width from 0.3 to 22 inches, or leave it empty.</p> : null}
      <label className="form-row">
        <span>Cell padding (pt)</span>
        <input className="field" name="table-padding" inputMode="decimal" placeholder="Default" value={padding} onChange={(ev) => setPadding(ev.target.value)} aria-invalid={padBad || undefined} />
      </label>
      {padBad ? <p className="form-error">Enter padding from 0 to 72 pt, or leave it empty.</p> : null}
      <label className="form-row">
        <span>Border</span>
        <Select aria-label="Border" name="table-border" value={p.borderWidth == null ? "" : String(p.borderWidth)} onValueChange={(ev) => setP({ ...p, borderWidth: ev === "" ? null : Number(ev) })}>
          <option value="">Default</option>
          {BORDER_WIDTHS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      <label className="form-row">
        <span>Border colour</span>
        <Select aria-label="Border colour" name="table-border-colour" disabled={!p.borderWidth} value={p.borderColor ?? "#000000"} onValueChange={(ev) => setP({ ...p, borderColor: ev })}>
          {BORDER_COLOURS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
      </label>
    </Dialog>
  );
}
