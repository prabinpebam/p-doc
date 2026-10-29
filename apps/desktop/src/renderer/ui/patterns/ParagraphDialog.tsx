/** Format > Paragraph… (U46–U48, spec §4.11): indents and spacing, line and page breaks, borders and direction, and tab stops. */
import { Select } from "../primitives/Select.tsx";
import { useState, type ReactNode } from "react";
import { BORDER_SIDES, cleanLayout, indentFromPositions, indentPositions, styleKeyOf, type BorderSide, type TabAlign, type TabLeader, type TabStop } from "@p-doc/core";
import { currentBlock, setParagraphFormat } from "../../editor/blocks.ts";
import { getEditor } from "../../session.ts";
import { app, closeDialog, type ParagraphTab } from "../../state.ts";
import { Dialog } from "../components/Dialog.tsx";
import { usesInches } from "./PageDialogs.tsx";

type Spacing = "1" | "1.15" | "1.5" | "2" | "multiple" | "atLeast" | "exact";
const SPACINGS: [Spacing, string][] = [
  ["1", "Single"],
  ["1.15", "1.15"],
  ["1.5", "1.5"],
  ["2", "Double"],
  ["multiple", "Multiple"],
  ["atLeast", "At least"],
  ["exact", "Exactly"],
];
const PRESETS = ["1", "1.15", "1.5", "2"];

const TABS: [ParagraphTab, string][] = [
  ["indents", "Indents and spacing"],
  ["breaks", "Line and page breaks"],
  ["borders", "Borders and direction"],
  ["tabs", "Tabs"],
];

const SIDE_LABEL: Record<BorderSide, string> = { top: "Top", bottom: "Bottom", left: "Left", right: "Right" };
const WIDTHS = ["0.5", "0.75", "1", "1.5", "2.25", "3", "4.5", "6"];
const ALIGNS: [TabAlign, string][] = [
  ["left", "Left"],
  ["center", "Centre"],
  ["right", "Right"],
  ["decimal", "Decimal"],
];
const LEADERS: [TabLeader, string][] = [
  ["none", "None"],
  ["dots", "Dots"],
  ["dashes", "Dashes"],
  ["line", "Line"],
];

interface BorderForm {
  on: boolean;
  width: string;
  color: string;
}

interface Form {
  left: string;
  right: string;
  special: "none" | "first" | "hanging";
  by: string;
  before: string;
  after: string;
  spacing: Spacing;
  at: string;
  keepNext: boolean;
  keepLines: boolean;
  breakBefore: boolean;
  widows: boolean;
  borders: Record<BorderSide, BorderForm>;
  shade: boolean;
  shading: string;
  dir: "ltr" | "rtl";
  tabs: TabStop[];
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
const parse = (s: string) => (s.trim() === "" ? NaN : Number(s.trim().replace(",", ".")));

/** The paragraph at the cursor as the form shows it; values it doesn't set come from its style. */
function readForm(perUnit: number): Form | null {
  const e = getEditor();
  const b = e && currentBlock(e);
  const doc = app.get().doc;
  if (!b || !doc) return null;
  const a = b.attrs;
  const l = cleanLayout(a.layout) ?? {};
  const key = styleKeyOf(b.type.name, a);
  const style = key ? doc.styles[key] : null;
  const lh = a.lineHeight != null ? Number(a.lineHeight) : (style?.lineHeight ?? 1.15);
  const rule = a.lineHeight != null ? l.lineRule : undefined;
  const spacing: Spacing = rule ?? (PRESETS.includes(String(lh)) ? (String(lh) as Spacing) : "multiple");
  const border = (s: BorderSide): BorderForm => ({ on: !!l.borders?.[s], width: String(l.borders?.[s]?.width ?? 1), color: l.borders?.[s]?.color ?? "#000000" });
  return {
    // As in Word, Left is where the lines after the first start; the first line is offset from it.
    left: fmt(indentPositions(a.indent, l.first).body * perUnit),
    right: fmt((l.right ?? 0) * perUnit),
    special: !l.first ? "none" : l.first > 0 ? "first" : "hanging",
    by: fmt(Math.abs(l.first ?? 0.5) * perUnit),
    before: fmt(Number(a.spaceBefore ?? style?.spaceBefore ?? 0)),
    after: fmt(Number(a.spaceAfter ?? style?.spaceAfter ?? 0)),
    spacing,
    at: fmt(rule ? lh : spacing === "multiple" ? lh : 3),
    keepNext: !!l.keepNext,
    keepLines: !!l.keepLines,
    breakBefore: !!l.breakBefore,
    widows: l.widows !== false,
    borders: Object.fromEntries(BORDER_SIDES.map((s) => [s, border(s)])) as Record<BorderSide, BorderForm>,
    shade: !!l.shading,
    shading: l.shading ?? "#fff2cc",
    dir: l.dir ?? "ltr",
    tabs: l.tabs ?? [],
  };
}

/** Which fields hold a value that can't be used. */
function problems(f: Form, perUnit: number): Set<string> {
  const bad = new Set<string>();
  const inRange = (k: keyof Form, min: number, max: number, scale = 1) => {
    const v = parse(String(f[k])) / scale;
    if (!Number.isFinite(v) || v < min || v > max) bad.add(k);
  };
  inRange("left", 0, 10, perUnit);
  inRange("right", 0, 10, perUnit);
  if (f.special !== "none") inRange("by", 0.01, 10, perUnit);
  inRange("before", 0, 1584);
  inRange("after", 0, 1584);
  if (f.spacing === "multiple") inRange("at", 0.5, 10);
  if (f.spacing === "atLeast" || f.spacing === "exact") inRange("at", 1, 1584);
  return bad;
}

/** What the form changes, as block attributes and a layout patch: only the settings the person changed. */
function changes(start: Form, f: Form, perUnit: number): { attrs: Record<string, unknown>; layout: Record<string, unknown> } {
  const attrs: Record<string, unknown> = {};
  const layout: Record<string, unknown> = {};
  const changed = (...keys: (keyof Form)[]) => keys.some((k) => JSON.stringify(start[k]) !== JSON.stringify(f[k]));
  const inches = (s: string) => Math.round((parse(s) / perUnit) * 1000) / 1000;
  if (changed("left", "special", "by")) {
    const body = inches(f.left);
    const offset = f.special === "none" ? 0 : f.special === "first" ? inches(f.by) : -inches(f.by);
    const at = indentFromPositions(body + offset, body);
    attrs.indent = at.indent;
    layout.first = at.first || null;
  }
  if (changed("right")) layout.right = inches(f.right) || null;
  if (changed("before")) attrs.spaceBefore = parse(f.before);
  if (changed("after")) attrs.spaceAfter = parse(f.after);
  if (changed("spacing", "at")) {
    const preset = PRESETS.includes(f.spacing);
    attrs.lineHeight = preset ? Number(f.spacing) : parse(f.at);
    layout.lineRule = f.spacing === "atLeast" || f.spacing === "exact" ? f.spacing : null;
  }
  for (const k of ["keepNext", "keepLines", "breakBefore"] as const) if (changed(k)) layout[k] = f[k] || null;
  if (changed("widows")) layout.widows = f.widows ? null : false;
  if (changed("borders")) {
    const on = BORDER_SIDES.filter((s) => f.borders[s].on);
    layout.borders = on.length ? Object.fromEntries(on.map((s) => [s, { width: Number(f.borders[s].width), color: f.borders[s].color }])) : null;
  }
  if (changed("shade", "shading")) layout.shading = f.shade ? f.shading : null;
  if (changed("dir")) layout.dir = f.dir === "rtl" ? "rtl" : null;
  if (changed("tabs")) layout.tabs = f.tabs.length ? f.tabs : null;
  return { attrs, layout };
}

function Field({ label, name, value, bad, disabled, onChange }: { label: ReactNode; name: string; value: string; bad?: boolean; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <label className="form-row">
      <span>{label}</span>
      <input className="field" inputMode="decimal" name={name} value={value} disabled={disabled} aria-invalid={bad || undefined} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Check({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export function ParagraphDialog({ tab: firstTab }: { tab?: ParagraphTab }) {
  const inches = usesInches();
  const unit = inches ? "in" : "cm";
  const perUnit = inches ? 1 : 2.54;
  const [start] = useState(() => readForm(perUnit));
  const [f, setF] = useState<Form | null>(start);
  const [tab, setTab] = useState<ParagraphTab>(firstTab ?? "indents");
  const [stop, setStop] = useState({ pos: "", align: "left" as TabAlign, leader: "none" as TabLeader });
  if (!start || !f) return null;
  const set = (patch: Partial<Form>) => setF((x) => (x ? { ...x, ...patch } : x));
  const setBorder = (s: BorderSide, patch: Partial<BorderForm>) => set({ borders: { ...f.borders, [s]: { ...f.borders[s], ...patch } } });
  const bad = problems(f, perUnit);
  const stopPos = parse(stop.pos) / perUnit;
  const stopBad = stop.pos.trim() !== "" && !(Number.isFinite(stopPos) && stopPos >= 0 && stopPos <= 22);
  const addStop = () => {
    if (stop.pos.trim() === "" || stopBad) return;
    const pos = Math.round(stopPos * 1000) / 1000;
    set({ tabs: [...f.tabs.filter((t) => Math.abs(t.pos - pos) > 0.005), { pos, align: stop.align, leader: stop.leader }].sort((a, b) => a.pos - b.pos) });
    setStop((s) => ({ ...s, pos: "" }));
  };
  const apply = () => {
    if (bad.size) return;
    const e = getEditor();
    closeDialog();
    if (!e) return;
    const { attrs, layout } = changes(start, f, perUnit);
    setParagraphFormat(e, attrs, layout);
    e.view.focus();
  };
  const tabButton = ([t, label]: [ParagraphTab, string], i: number) => (
    <button
      key={t}
      type="button"
      role="tab"
      id={`para-tab-${t}`}
      aria-selected={tab === t}
      aria-controls={`para-panel-${t}`}
      tabIndex={tab === t ? 0 : -1}
      className="tab"
      onClick={() => setTab(t)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]![0];
        setTab(next);
        requestAnimationFrame(() => document.getElementById(`para-tab-${next}`)?.focus());
      }}
    >
      {label}
    </button>
  );
  const fixed = PRESETS.includes(f.spacing);
  return (
    <Dialog
      title="Paragraph"
      wide
      className="paragraph-dialog"
      onClose={closeDialog}
      onSubmit={() => {
        // Enter in the tab position field sets the stop rather than closing.
        if (document.activeElement?.getAttribute("name") === "tab-pos" && stop.pos.trim()) return addStop();
        apply();
      }}
      actions={
        <>
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={bad.size > 0}>
            Apply
          </button>
        </>
      }
    >
      <div role="tablist" aria-label="Paragraph settings" className="tabs">
        {TABS.map(tabButton)}
      </div>
      <div role="tabpanel" id={`para-panel-${tab}`} aria-labelledby={`para-tab-${tab}`} className="dialog-panel">
        {tab === "indents" && (
          <>
            <div className="form-grid" role="group" aria-label="Indentation">
              <Field label={`Left (${unit})`} name="indent-left" value={f.left} bad={bad.has("left")} onChange={(v) => set({ left: v })} />
              <Field label={`Right (${unit})`} name="indent-right" value={f.right} bad={bad.has("right")} onChange={(v) => set({ right: v })} />
              <label className="form-row">
                <span>Special</span>
                <Select name="special" value={f.special} onValueChange={(e) => set({ special: e as Form["special"] })}>
                  <option value="none">None</option>
                  <option value="first">First line</option>
                  <option value="hanging">Hanging</option>
                </Select>
              </label>
              <Field label={`By (${unit})`} name="indent-by" value={f.by} bad={bad.has("by")} disabled={f.special === "none"} onChange={(v) => set({ by: v })} />
            </div>
            <div className="form-grid" role="group" aria-label="Spacing">
              <Field label="Before (pt)" name="space-before" value={f.before} bad={bad.has("before")} onChange={(v) => set({ before: v })} />
              <Field label="After (pt)" name="space-after" value={f.after} bad={bad.has("after")} onChange={(v) => set({ after: v })} />
              <label className="form-row">
                <span>Line spacing</span>
                <Select
                  name="line-spacing"
                  value={f.spacing}
                  onValueChange={(e) => {
                    const spacing = e as Spacing;
                    const was = PRESETS.includes(f.spacing) ? Number(f.spacing) : parse(f.at);
                    // Points for At least and Exactly start from the line height at 12 pt type.
                    const at = spacing === "multiple" ? (f.spacing === "multiple" ? f.at : fmt(PRESETS.includes(f.spacing) ? was : 1.15)) : spacing === "atLeast" || spacing === "exact" ? (f.spacing === "atLeast" || f.spacing === "exact" ? f.at : "12") : f.at;
                    set({ spacing, at });
                  }}
                >
                  {SPACINGS.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <Field label={f.spacing === "multiple" ? "At (lines)" : "At (pt)"} name="line-at" value={fixed ? f.spacing : f.at} bad={bad.has("at")} disabled={fixed} onChange={(v) => set({ at: v })} />
            </div>
          </>
        )}
        {tab === "breaks" && (
          <div role="group" aria-label="Pagination">
            <Check name="widows" checked={f.widows} onChange={(v) => set({ widows: v })}>
              Widow and orphan control
            </Check>
            <Check name="keep-next" checked={f.keepNext} onChange={(v) => set({ keepNext: v })}>
              Keep with next
            </Check>
            <Check name="keep-lines" checked={f.keepLines} onChange={(v) => set({ keepLines: v })}>
              Keep lines together
            </Check>
            <Check name="break-before" checked={f.breakBefore} onChange={(v) => set({ breakBefore: v })}>
              Page break before
            </Check>
          </div>
        )}
        {tab === "borders" && (
          <>
            <div role="group" aria-label="Borders" className="settings-section">
              <h3 className="group-title">Borders</h3>
              {BORDER_SIDES.map((s) => (
                <div key={s} className="form-row inline border-row">
                  <Check name={`border-${s}`} checked={f.borders[s].on} onChange={(v) => setBorder(s, { on: v })}>
                    {SIDE_LABEL[s]}
                  </Check>
                  <Select aria-label={`${SIDE_LABEL[s]} border width`} name={`border-${s}-width`} value={f.borders[s].width} disabled={!f.borders[s].on} onValueChange={(e) => setBorder(s, { width: e })}>
                    {WIDTHS.map((w) => (
                      <option key={w} value={w}>
                        {w} pt
                      </option>
                    ))}
                  </Select>
                  <input type="color" className="swatch-input" aria-label={`${SIDE_LABEL[s]} border colour`} value={f.borders[s].color} disabled={!f.borders[s].on} onChange={(e) => setBorder(s, { color: e.target.value })} />
                </div>
              ))}
            </div>
            <div className="form-row inline">
              <Check name="shading" checked={f.shade} onChange={(v) => set({ shade: v })}>
                Background colour
              </Check>
              <input type="color" className="swatch-input" aria-label="Background colour" value={f.shading} disabled={!f.shade} onChange={(e) => set({ shading: e.target.value })} />
            </div>
            <div role="radiogroup" aria-labelledby="para-dir" className="settings-section">
              <h3 id="para-dir" className="group-title">
                Direction
              </h3>
              <div className="radio-row">
                <label className="radio">
                  <input type="radio" name="dir" checked={f.dir === "ltr"} onChange={() => set({ dir: "ltr" })} />
                  Left to right
                </label>
                <label className="radio">
                  <input type="radio" name="dir" checked={f.dir === "rtl"} onChange={() => set({ dir: "rtl" })} />
                  Right to left
                </label>
              </div>
            </div>
          </>
        )}
        {tab === "tabs" && (
          <>
            <div className="form-grid tab-stop-form" role="group" aria-label="New tab stop">
              <Field label={`Position (${unit})`} name="tab-pos" value={stop.pos} bad={stopBad} onChange={(v) => setStop((s) => ({ ...s, pos: v }))} />
              <label className="form-row">
                <span>Alignment</span>
                <Select name="tab-align" value={stop.align} onValueChange={(e) => setStop((s) => ({ ...s, align: e as TabAlign }))}>
                  {ALIGNS.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="form-row">
                <span>Leader</span>
                <Select name="tab-leader" value={stop.leader} onValueChange={(e) => setStop((s) => ({ ...s, leader: e as TabLeader }))}>
                  {LEADERS.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="form-row">
                <span aria-hidden="true">&nbsp;</span>
                <button type="button" className="btn" disabled={stop.pos.trim() === "" || stopBad} onClick={addStop}>
                  Set
                </button>
              </div>
            </div>
            {f.tabs.length ? (
              <ul className="tab-stops" aria-label="Tab stops">
                {f.tabs.map((t) => {
                  const where = `${fmt(t.pos * perUnit)} ${unit}`;
                  return (
                    <li key={t.pos}>
                      <span>
                        {where} · {ALIGNS.find(([v]) => v === t.align)![1]}
                        {t.leader !== "none" ? ` · ${LEADERS.find(([v]) => v === t.leader)![1]}` : ""}
                      </span>
                      <button type="button" className="btn" aria-label={`Remove tab stop at ${where}`} onClick={() => set({ tabs: f.tabs.filter((x) => x !== t) })}>
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">No tab stops: Tab moves to the next default stop, every {inches ? "half inch" : "1.27 cm"}.</p>
            )}
            <button type="button" className="btn" disabled={!f.tabs.length} onClick={() => set({ tabs: [] })}>
              Clear all
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}
