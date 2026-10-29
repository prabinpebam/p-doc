/** Format > Image > Alt text and Image options (U40): the keyboard way to describe, size and crop an image. */
import { useState } from "react";
import { cleanCrop, CSS_PX_PER_INCH } from "@p-doc/core";
import { setImage } from "../../commands.ts";
import { selectedImage } from "../../editor/image.ts";
import { getEditor } from "../../session.ts";
import { closeDialog } from "../../state.ts";
import { Dialog } from "../components/Dialog.tsx";
import { usesInches } from "./PageDialogs.tsx";

function Cancel() {
  return (
    <button type="button" className="btn" onClick={closeDialog}>
      Cancel
    </button>
  );
}

const selected = () => {
  const e = getEditor();
  return e ? selectedImage(e.state) : null;
};

export function ImageAltDialog() {
  const [alt, setAlt] = useState(() => String(selected()?.node.attrs.alt ?? ""));
  if (!selected()) return null;
  return (
    <Dialog
      title="Alt text"
      onClose={closeDialog}
      onSubmit={() => {
        closeDialog();
        setImage({ alt: alt.trim() || null });
      }}
      actions={
        <>
          <Cancel />
          <button type="submit" className="btn primary">
            Apply
          </button>
        </>
      }
    >
      <label className="form-row">
        <span>Describe this image for people who can't see it.</span>
        <textarea className="field" name="alt" rows={3} data-autofocus value={alt} onChange={(e) => setAlt(e.target.value)} />
      </label>
    </Dialog>
  );
}

const EDGES = [
  ["left", "Left"],
  ["top", "Top"],
  ["right", "Right"],
  ["bottom", "Bottom"],
] as const;
type Edge = (typeof EDGES)[number][0];

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const MIN_PX = 16;

export function ImageOptionsDialog() {
  const inches = usesInches();
  const unit = inches ? "in" : "cm";
  const perUnit = inches ? CSS_PX_PER_INCH : CSS_PX_PER_INCH / 2.54;
  const [start] = useState(() => {
    const e = getEditor();
    const s = selected();
    if (!e || !s) return null;
    const a = s.node.attrs;
    const frame = (e.view.nodeDOM(s.pos) as HTMLElement | null)?.querySelector<HTMLElement>(".pd-img-frame");
    const w = Number(a.width) || frame?.offsetWidth || Number(a.naturalWidth) || 1;
    const h = Number(a.height) || frame?.offsetHeight || Number(a.naturalHeight) || 1;
    const c = cleanCrop(a.crop) ?? { x: 0, y: 0, w: 1, h: 1 };
    // The picture's own shape; when unknown, the shape it's shown in.
    const nw = Number(a.naturalWidth) || w / c.w;
    const nh = Number(a.naturalHeight) || h / c.h;
    return { w, h, c, nw, nh, keep: a.height == null, max: (e.view.dom as HTMLElement).clientWidth || Infinity };
  });
  const [width, setWidth] = useState(() => (start ? fmt(start.w / perUnit) : ""));
  const [height, setHeight] = useState(() => (start ? fmt(start.h / perUnit) : ""));
  const [keep, setKeep] = useState(start?.keep ?? true);
  const [crop, setCrop] = useState<Record<Edge, string>>(() => {
    const c = start?.c ?? { x: 0, y: 0, w: 1, h: 1 };
    return { left: fmt(c.x * 100), top: fmt(c.y * 100), right: fmt((1 - c.x - c.w) * 100), bottom: fmt((1 - c.y - c.h) * 100) };
  });
  if (!start || !selected()) return null;
  const n = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const edges = Object.fromEntries(EDGES.map(([k]) => [k, n(crop[k])])) as Record<Edge, number>;
  const badCrop = EDGES.some(([k]) => !Number.isFinite(edges[k]) || edges[k] < 0) || edges.left + edges.right > 95 || edges.top + edges.bottom > 95;
  const c = badCrop ? start.c : { x: edges.left / 100, y: edges.top / 100, w: 1 - (edges.left + edges.right) / 100, h: 1 - (edges.top + edges.bottom) / 100 };
  // Kept proportions follow the part of the picture shown.
  const aspect = (start.nh * c.h) / (start.nw * c.w);
  const wPx = n(width) * perUnit;
  const hPx = keep ? wPx * aspect : n(height) * perUnit;
  const badSize = !Number.isFinite(wPx) || !Number.isFinite(hPx) || wPx < MIN_PX || hPx < MIN_PX;
  const shownHeight = keep && Number.isFinite(wPx) ? fmt((wPx * aspect) / perUnit) : height;
  const submit = () => {
    if (badCrop || badSize) return;
    const w = Math.min(wPx, start.max);
    closeDialog();
    setImage({ width: Math.round(w), height: keep ? null : Math.round((hPx * w) / wPx), crop: cleanCrop(c) });
  };
  return (
    <Dialog
      title="Image options"
      onClose={closeDialog}
      onSubmit={submit}
      actions={
        <>
          <Cancel />
          <button type="submit" className="btn primary" disabled={badCrop || badSize}>
            Apply
          </button>
        </>
      }
    >
      <div className="form-grid" role="group" aria-label={`Size (${inches ? "inches" : "centimetres"})`}>
        <label className="form-row">
          <span>Width ({unit})</span>
          <input className="field" inputMode="decimal" name="image-width" data-autofocus value={width} aria-invalid={badSize || undefined} onChange={(e) => setWidth(e.target.value)} />
        </label>
        <label className="form-row">
          <span>Height ({unit})</span>
          <input className="field" inputMode="decimal" name="image-height" value={shownHeight} readOnly={keep} aria-invalid={badSize || undefined} onChange={(e) => setHeight(e.target.value)} />
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          name="keep-proportions"
          checked={keep}
          onChange={(e) => {
            if (!e.target.checked) setHeight(shownHeight);
            setKeep(e.target.checked);
          }}
        />
        Keep proportions
      </label>
      {badSize ? <p className="form-error">Enter a size of at least {fmt(MIN_PX / perUnit)} {unit}.</p> : null}
      <div className="form-grid" role="group" aria-label="Crop (% of the image)">
        {EDGES.map(([k, label]) => (
          <label key={k} className="form-row">
            <span>Crop {label.toLowerCase()} (%)</span>
            <input className="field" inputMode="decimal" name={`crop-${k}`} value={crop[k]} aria-invalid={badCrop || undefined} onChange={(e) => setCrop((x) => ({ ...x, [k]: e.target.value }))} />
          </label>
        ))}
      </div>
      {badCrop ? <p className="form-error">Each crop is 0 or more, and at least 5% of the image stays across and down.</p> : null}
    </Dialog>
  );
}
