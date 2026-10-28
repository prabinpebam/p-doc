/** File > Page setup and Insert > Header and footer (U13–U15, spec §4.4). */
import { useRef, useState } from "react";
import { defaultPage, PAPER, type HfAlign, type PageSetup, type PaperSize } from "@p-doc/core";
import { syncSelection, updateDoc } from "../session.ts";
import { app, closeDialog, toast, updateSettings } from "../state.ts";
import { Dialog } from "./Dialog.tsx";

/** Margins show in centimetres outside the US, as in Word and Google Docs. */
export const usesInches = () => /^en-(US|LR)|^my/i.test(navigator.language || "en-US");

const MARGINS = [
  ["top", "Top"],
  ["bottom", "Bottom"],
  ["left", "Left"],
  ["right", "Right"],
] as const;

const fmt = (n: number) => String(Math.round(n * 100) / 100);

function Cancel() {
  return (
    <button type="button" className="btn" onClick={closeDialog}>
      Cancel
    </button>
  );
}

/** The page settings a new document starts with: everything but header and footer text. */
export const asDefault = (p: PageSetup): PageSetup => ({ ...p, header: "", footer: "", firstHeader: "", firstFooter: "", differentFirstPage: false });

export function PageSetupDialog() {
  const doc = app.use((s) => s.doc);
  const inches = usesInches();
  const unit = inches ? "in" : "cm";
  const k = inches ? 1 : 2.54;
  const start = doc?.page ?? defaultPage(navigator.language);
  const [p, setP] = useState<PageSetup>(start);
  const [margins, setMargins] = useState<Record<string, string>>(() => Object.fromEntries(MARGINS.map(([m]) => [m, fmt(start.margins[m] * k)])));
  if (!doc) return null;
  const set = (patch: Partial<PageSetup>) => setP((x) => ({ ...x, ...patch }));
  const paper = PAPER[p.size];
  const [w, h] = p.orientation === "landscape" ? [paper.height, paper.width] : [paper.width, paper.height];
  const values = Object.fromEntries(MARGINS.map(([m]) => [m, Number(margins[m]) / k])) as Record<(typeof MARGINS)[number][0], number>;
  // Each margin is a number of at least 0; at least an inch of text is left across and down.
  const bad = MARGINS.filter(([m]) => margins[m]!.trim() === "" || !Number.isFinite(values[m]) || values[m] < 0).map(([m]) => m as string);
  const tooBig = !bad.length && (values.left + values.right > w - 1 || values.top + values.bottom > h - 1);
  const result = (): PageSetup | null => (bad.length || tooBig ? null : { ...p, margins: { ...values } });
  const pageless = p.mode === "pageless";
  return (
    <Dialog
      title="Page setup"
      onClose={closeDialog}
      onSubmit={() => {
        const r = result();
        if (!r) return;
        if (JSON.stringify(r) !== JSON.stringify(doc.page)) updateDoc({ page: r });
        closeDialog();
      }}
      actions={
        <>
          <button
            type="button"
            className="btn"
            disabled={!result()}
            onClick={() => {
              const r = result();
              if (!r) return;
              void updateSettings({ pageDefault: asDefault(r) });
              toast("New documents will use this page setup.");
            }}
          >
            Set as default
          </button>
          <span className="fill" />
          <Cancel />
          <button type="submit" className="btn primary" disabled={!result()}>
            Apply
          </button>
        </>
      }
    >
      <div role="radiogroup" aria-labelledby="ps-format" className="settings-section">
        <h3 id="ps-format" className="group-title">
          Format
        </h3>
        <div className="radio-row">
          <label className="radio">
            <input type="radio" name="ps-mode" data-autofocus={!pageless || undefined} checked={!pageless} onChange={() => set({ mode: "pages" })} />
            Pages
          </label>
          <label className="radio">
            <input type="radio" name="ps-mode" data-autofocus={pageless || undefined} checked={pageless} onChange={() => set({ mode: "pageless" })} />
            Pageless
          </label>
        </div>
        <p className="muted">{pageless ? "One long sheet. Headers, footers and page breaks are kept and show again with pages." : "Pages as they print, with headers, footers and page breaks."}</p>
      </div>
      <fieldset className="plain" disabled={pageless}>
        <div role="radiogroup" aria-labelledby="ps-orient" className="settings-section">
          <h3 id="ps-orient" className="group-title">
            Orientation
          </h3>
          <div className="radio-row">
            <label className="radio">
              <input type="radio" name="ps-orient" checked={p.orientation === "portrait"} onChange={() => set({ orientation: "portrait" })} />
              Portrait
            </label>
            <label className="radio">
              <input type="radio" name="ps-orient" checked={p.orientation === "landscape"} onChange={() => set({ orientation: "landscape" })} />
              Landscape
            </label>
          </div>
        </div>
        <label className="form-row">
          <span>Paper size</span>
          <select className="field" value={p.size} onChange={(e) => set({ size: e.target.value as PaperSize })}>
            {(Object.keys(PAPER) as PaperSize[]).map((s) => (
              <option key={s} value={s}>
                {PAPER[s].label}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid" role="group" aria-label={`Margins (${unit === "in" ? "inches" : "centimetres"})`}>
          {MARGINS.map(([m, label]) => (
            <label key={m} className="form-row">
              <span>
                {label} ({unit})
              </span>
              <input
                className="field"
                inputMode="decimal"
                name={`margin-${m}`}
                value={margins[m]}
                aria-invalid={bad.includes(m) || tooBig || undefined}
                onChange={(e) => setMargins((x) => ({ ...x, [m]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        {bad.length ? <p className="form-error">Enter a margin of 0 or more.</p> : null}
        {tooBig ? <p className="form-error">The margins leave no room for text. Make them smaller.</p> : null}
      </fieldset>
      <label className="form-row inline">
        <span>Page colour</span>
        <input type="color" className="swatch-input" value={p.color} onChange={(e) => set({ color: e.target.value })} />
      </label>
    </Dialog>
  );
}

const ALIGNS: [HfAlign, string][] = [
  ["left", "Left"],
  ["center", "Centre"],
  ["right", "Right"],
];

type HfField = "header" | "footer" | "firstHeader" | "firstFooter";

export function HeaderFooterDialog() {
  const doc = app.use((s) => s.doc);
  const [p, setP] = useState<PageSetup | null>(doc?.page ?? null);
  const last = useRef<{ field: HfField; at: number }>({ field: "footer", at: -1 });
  if (!doc || !p) return null;
  const set = (patch: Partial<PageSetup>) => setP((x) => (x ? { ...x, ...patch } : x));
  const track = (field: HfField) => (e: { currentTarget: HTMLInputElement }) => {
    last.current = { field, at: e.currentTarget.selectionStart ?? e.currentTarget.value.length };
  };
  const token = (t: string) => {
    const { field, at } = last.current;
    const v = p[field];
    const i = at < 0 || at > v.length ? v.length : at;
    set({ [field]: v.slice(0, i) + t + v.slice(i) });
    last.current = { field, at: i + t.length };
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement>(`input[name="hf-${field}"]`);
      el?.focus();
      el?.setSelectionRange(i + t.length, i + t.length);
    });
  };
  const text = (field: HfField, label: string, autofocus = false) => (
    <label className="form-row">
      <span>{label}</span>
      <input className="field" name={`hf-${field}`} data-autofocus={autofocus || undefined} value={p[field]} onChange={(e) => set({ [field]: e.target.value })} onSelect={track(field)} onFocus={track(field)} />
    </label>
  );
  const align = (which: "headerAlign" | "footerAlign", label: string) => (
    <label className="form-row">
      <span>{label}</span>
      <select className="field" name={`hf-${which}`} value={p[which]} onChange={(e) => set({ [which]: e.target.value as HfAlign })}>
        {ALIGNS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <Dialog
      title="Header and footer"
      onClose={closeDialog}
      onSubmit={() => {
        if (JSON.stringify(p) !== JSON.stringify(doc.page)) updateDoc({ page: p });
        closeDialog();
        syncSelection();
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
      <div className="form-grid wide-first">
        {text("header", "Header", true)}
        {align("headerAlign", "Align")}
        {text("footer", "Footer")}
        {align("footerAlign", "Align")}
      </div>
      <label className="check">
        <input type="checkbox" name="hf-first" checked={p.differentFirstPage} onChange={(e) => set({ differentFirstPage: e.target.checked })} />
        Different first page
      </label>
      {p.differentFirstPage ? (
        <div className="form-grid">
          {text("firstHeader", "First page header")}
          {text("firstFooter", "First page footer")}
        </div>
      ) : null}
      <div className="button-row">
        <button type="button" className="btn" onMouseDown={(e) => e.preventDefault()} onClick={() => token("{page}")}>
          Page number
        </button>
        <button type="button" className="btn" onMouseDown={(e) => e.preventDefault()} onClick={() => token("{pages}")}>
          Page count
        </button>
      </div>
      <p className="muted">{doc.page.mode === "pageless" ? "Headers and footers show with pages (View > Pages)." : "{page} is the page number and {pages} the page count."}</p>
    </Dialog>
  );
}
