/** File > Page setup and Insert > Header and footer (U13–U15, spec §4.4). */
import { useRef, useState } from "react";
import { defaultPage, HF_FIELDS, hfTextsOf, NUM_FORMAT_LABEL, NUM_FORMATS, PAPER, sectionPageOf, type HfAlign, type HfTexts, type NumFormat, type PageSetup, type PaperSize, type SectionNumbering } from "@p-doc/core";
import { getEditor, syncSelection, updateDoc } from "../session.ts";
import { clearSectionPages, sectionAtCursor, setSectionHf, setSectionPage } from "../editor/sections.ts";
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
export const asDefault = (p: PageSetup): PageSetup => ({ ...p, header: "", footer: "", firstHeader: "", firstFooter: "", differentFirstPage: false, evenHeader: "", evenFooter: "", differentOddEven: false, numStart: 1 });

export function PageSetupDialog() {
  const doc = app.use((s) => s.doc);
  const inches = usesInches();
  const unit = inches ? "in" : "cm";
  const k = inches ? 1 : 2.54;
  const base = doc?.page ?? defaultPage(navigator.language);
  // With sections, the dialog starts on the cursor's section (U55).
  const [at] = useState(() => {
    const ed = getEditor();
    return ed ? sectionAtCursor(ed.state, base) : null;
  });
  const sectioned = !!at && at.sections.length > 1;
  const [scope, setScope] = useState<"document" | "section">(sectioned ? "section" : "document");
  const start: PageSetup = sectioned ? { ...base, ...sectionPageOf(at.sections[at.index]!.page) } : base;
  const continuous = sectioned && at.index > 0 && at.sections[at.index]!.start === "continuous";
  const [newPage, setNewPage] = useState(false);
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
        const ed = getEditor();
        if (sectioned && ed && scope === "section") {
          // This section: its geometry on its break (the first section's is the document's); the rest is the document's.
          const own = sectionPageOf(r);
          setSectionPage(ed, at.sections, at.index, own, continuous && newPage ? "next" : undefined);
          const page = at.index === 0 ? r : { ...r, ...sectionPageOf(doc.page) };
          if (JSON.stringify(page) !== JSON.stringify(doc.page)) updateDoc({ page });
        } else {
          if (sectioned && ed) clearSectionPages(ed);
          if (JSON.stringify(r) !== JSON.stringify(doc.page)) updateDoc({ page: r });
        }
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
        {sectioned ? (
          <label className="form-row">
            <span>Apply to</span>
            <select className="field" value={scope} onChange={(e) => setScope(e.target.value as "document" | "section")}>
              <option value="section">This section</option>
              <option value="document">Whole document</option>
            </select>
          </label>
        ) : null}
        {continuous && scope === "section" ? (
          <label className="check">
            <input type="checkbox" checked={newPage} onChange={(e) => setNewPage(e.target.checked)} />
            Starts on a new page
          </label>
        ) : null}
        <fieldset className="plain" disabled={continuous && scope === "section" && !newPage}>
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
        {continuous && scope === "section" && !newPage ? <p className="muted">A section that starts on the same page keeps its paper. Choose Starts on a new page to change it.</p> : null}
        </fieldset>
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

type HfField = (typeof HF_FIELDS)[number];

export function HeaderFooterDialog() {
  const doc = app.use((s) => s.doc);
  const [p, setP] = useState<PageSetup | null>(doc?.page ?? null);
  // With sections, the dialog edits the cursor's section (U57).
  const [at] = useState(() => {
    const ed = getEditor();
    return ed && doc ? sectionAtCursor(ed.state, doc.page) : null;
  });
  const k = at?.index ?? 0;
  const sec = at?.sections[k];
  const brk = (() => {
    const ed = getEditor();
    if (!ed || sec?.breakAt == null) return null;
    let n: { hf: HfTexts | null; numbering: SectionNumbering | null } | null = null;
    ed.state.doc.forEach((x, _o, i) => {
      if (i === sec.breakAt) n = { hf: (x.attrs.hf as HfTexts | null) ?? null, numbering: (x.attrs.numbering as SectionNumbering | null) ?? null };
    });
    return n as { hf: HfTexts | null; numbering: SectionNumbering | null } | null;
  })();
  const [linked, setLinked] = useState(k > 0 && !brk?.hf);
  const [own, setOwn] = useState<HfTexts>(() => (sec ? { ...sec.hf } : { header: "", footer: "", firstHeader: "", firstFooter: "", evenHeader: "", evenFooter: "" }));
  const [format, setFormat] = useState<NumFormat>(k > 0 ? (sec?.format ?? "1") : (doc?.page.numFormat ?? "1"));
  const [restart, setRestart] = useState(k === 0 || brk?.numbering?.start != null);
  const [startAt, setStartAt] = useState(String(k > 0 ? (brk?.numbering?.start ?? 1) : (doc?.page.numStart ?? 1)));
  const last = useRef<{ field: HfField; at: number }>({ field: "footer", at: -1 });
  if (!doc || !p) return null;
  const set = (patch: Partial<PageSetup>) => setP((x) => (x ? { ...x, ...patch } : x));
  const texts: HfTexts = k === 0 ? p : linked ? (at?.sections[k - 1]?.hf ?? own) : own;
  const setText = (field: HfField, v: string) => (k === 0 ? set({ [field]: v }) : setOwn((x) => ({ ...x, [field]: v })));
  const start = Number(startAt);
  const badStart = restart && (startAt.trim() === "" || !Number.isInteger(start) || start < 0 || start > 9999);
  const track = (field: HfField) => (e: { currentTarget: HTMLInputElement }) => {
    last.current = { field, at: e.currentTarget.selectionStart ?? e.currentTarget.value.length };
  };
  const token = (t: string) => {
    const { field, at: i0 } = last.current;
    const v = texts[field];
    const i = i0 < 0 || i0 > v.length ? v.length : i0;
    setText(field, v.slice(0, i) + t + v.slice(i));
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
      <input className="field" name={`hf-${field}`} data-autofocus={autofocus || undefined} value={texts[field]} readOnly={linked} onChange={(e) => setText(field, e.target.value)} onSelect={track(field)} onFocus={track(field)} />
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
  const sectioned = !!at && at.sections.length > 1;
  return (
    <Dialog
      title="Header and footer"
      onClose={closeDialog}
      onSubmit={() => {
        if (badStart) return;
        const ed = getEditor();
        // The first section's texts and numbers are the document's; a later section's are on its break.
        const page: PageSetup = k === 0 ? { ...p, numFormat: format, numStart: start } : { ...p, ...hfTextsOf(doc.page), numFormat: doc.page.numFormat, numStart: doc.page.numStart };
        if (k > 0 && ed && at) setSectionHf(ed, at.sections, k, linked ? null : own, { format, start: restart ? start : null });
        if (JSON.stringify(page) !== JSON.stringify(doc.page)) updateDoc({ page });
        closeDialog();
        syncSelection();
      }}
      actions={
        <>
          <Cancel />
          <button type="submit" className="btn primary" disabled={badStart}>
            Apply
          </button>
        </>
      }
    >
      {sectioned ? (
        <div className="settings-section">
          <p className="muted">
            Section {k + 1} of {at.sections.length}
          </p>
          {k > 0 ? (
            <label className="check">
              <input type="checkbox" name="hf-linked" checked={linked} onChange={(e) => setLinked(e.target.checked)} />
              Link to previous
            </label>
          ) : null}
          {linked ? <p className="muted">Same as the section before. Turn off Link to previous to give this section its own.</p> : null}
        </div>
      ) : null}
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
      <label className="check">
        <input type="checkbox" name="hf-oddEven" checked={p.differentOddEven} onChange={(e) => set({ differentOddEven: e.target.checked })} />
        Different odd and even pages
      </label>
      {p.differentOddEven ? (
        <div className="form-grid">
          {text("evenHeader", "Even page header")}
          {text("evenFooter", "Even page footer")}
        </div>
      ) : null}
      <div className="button-row">
        <button type="button" className="btn" disabled={linked} onMouseDown={(e) => e.preventDefault()} onClick={() => token("{page}")}>
          Page number
        </button>
        <button type="button" className="btn" disabled={linked} onMouseDown={(e) => e.preventDefault()} onClick={() => token("{pages}")}>
          Page count
        </button>
      </div>
      <div className="settings-section">
        <h3 className="group-title">Page numbers</h3>
        <div className="form-grid">
          <label className="form-row">
            <span>Format</span>
            <select className="field" name="hf-numFormat" value={format} onChange={(e) => setFormat(e.target.value as NumFormat)}>
              {NUM_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {NUM_FORMAT_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          {k > 0 ? (
            <label className="form-row">
              <span>Numbering</span>
              <select className="field" name="hf-numbering" value={restart ? "start" : "continue"} onChange={(e) => setRestart(e.target.value === "start")}>
                <option value="continue">Continue from the section before</option>
                <option value="start">Start at</option>
              </select>
            </label>
          ) : null}
          <label className="form-row">
            <span>Start at</span>
            <input className="field" name="hf-numStart" type="number" min={0} max={9999} disabled={!restart} aria-invalid={badStart || undefined} value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </label>
        </div>
        {badStart ? (
          <p className="form-error" role="alert">
            Enter a whole number from 0 to 9999.
          </p>
        ) : null}
      </div>
      <p className="muted">{doc.page.mode === "pageless" ? "Headers and footers show with pages (View > Pages)." : "{page} is the page number and {pages} the page count."}</p>
    </Dialog>
  );
}