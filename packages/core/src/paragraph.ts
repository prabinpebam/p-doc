/**
 * Paragraph layout (U46–U50, spec §4.11): right and first-line indents, exact and at-least line spacing,
 * page-break control, borders, shading, direction and tab stops. Kept in one `layout` attribute that is
 * null for an ordinary paragraph, so the file stays small.
 */
import { Node } from "@tiptap/core";

export type TabAlign = "left" | "center" | "right" | "decimal";
export type TabLeader = "none" | "dots" | "dashes" | "line";
export interface TabStop {
  /** Inches from the left margin. */
  pos: number;
  align: TabAlign;
  leader: TabLeader;
}

export interface Border {
  /** Points. */
  width: number;
  /** #rrggbb */
  color: string;
}
export type BorderSide = "top" | "bottom" | "left" | "right";
export const BORDER_SIDES: readonly BorderSide[] = ["top", "bottom", "left", "right"];

export interface ParaLayout {
  /** Right indent, inches. */
  right?: number;
  /** First-line indent, inches: positive indents the first line, negative hangs it (the other lines indent). */
  first?: number;
  /** How `lineHeight` reads: absent, a multiple; otherwise points, exactly or at least. */
  lineRule?: "exact" | "atLeast";
  keepNext?: boolean;
  keepLines?: boolean;
  breakBefore?: boolean;
  /** Widow and orphan control is on unless this is false. */
  widows?: false;
  borders?: Partial<Record<BorderSide, Border>>;
  /** Background colour, #rrggbb. */
  shading?: string;
  dir?: "rtl";
  tabs?: TabStop[];
}

const COLOR = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, min: number, max: number): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 1000) / 1000 : undefined);
const TAB_ALIGNS: readonly TabAlign[] = ["left", "center", "right", "decimal"];
const LEADERS: readonly TabLeader[] = ["none", "dots", "dashes", "line"];

/** A layout from a file, a paste or the dialog: known, valid values kept; null when nothing is left. */
export function cleanLayout(raw: unknown): ParaLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: ParaLayout = {};
  const right = num(r.right, -10, 10);
  if (right) out.right = right;
  const first = num(r.first, -10, 10);
  if (first) out.first = first;
  if (r.lineRule === "exact" || r.lineRule === "atLeast") out.lineRule = r.lineRule;
  if (r.keepNext === true) out.keepNext = true;
  if (r.keepLines === true) out.keepLines = true;
  if (r.breakBefore === true) out.breakBefore = true;
  if (r.widows === false) out.widows = false;
  if (r.borders && typeof r.borders === "object") {
    const b: Partial<Record<BorderSide, Border>> = {};
    for (const s of BORDER_SIDES) {
      const x = (r.borders as Record<string, unknown>)[s] as Record<string, unknown> | undefined;
      const width = num(x?.width, 0.25, 12);
      if (x && width && typeof x.color === "string" && COLOR.test(x.color)) b[s] = { width, color: x.color.toLowerCase() };
    }
    if (Object.keys(b).length) out.borders = b;
  }
  if (typeof r.shading === "string" && COLOR.test(r.shading)) out.shading = r.shading.toLowerCase();
  if (r.dir === "rtl") out.dir = "rtl";
  if (Array.isArray(r.tabs)) {
    const tabs = r.tabs
      .map((t: Record<string, unknown>) => ({ pos: num(t?.pos, 0, 22), align: TAB_ALIGNS.includes(t?.align as TabAlign) ? (t.align as TabAlign) : "left", leader: LEADERS.includes(t?.leader as TabLeader) ? (t.leader as TabLeader) : "none" }))
      .filter((t): t is TabStop => t.pos != null)
      .sort((a, b) => a.pos - b.pos)
      .filter((t, i, all) => i === 0 || Math.abs(t.pos - all[i - 1]!.pos) > 0.005);
    if (tabs.length) out.tabs = tabs.slice(0, 64);
  }
  return Object.keys(out).length ? out : null;
}

/** A layout with a change applied (undefined or null in the patch removes that setting). */
export function patchLayout(layout: unknown, patch: Record<string, unknown>): ParaLayout | null {
  const next: Record<string, unknown> = { ...(cleanLayout(layout) ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) delete next[k];
    else next[k] = v;
  }
  return cleanLayout(next);
}

/** Border spacing inside a bordered side, as Word sets it: 1 pt top and bottom, 4 pt left and right. */
const BORDER_GAP: Record<BorderSide, number> = { top: 1, bottom: 1, left: 4, right: 4 };

/**
 * The CSS a paragraph's layout draws with. Space before stays outside a top border (as in Word): the
 * bordered paragraph takes it as a margin, since its padding is the border spacing.
 */
export function layoutCss(l: ParaLayout | null): string {
  if (!l) return "";
  const out: string[] = [];
  if (l.right) out.push(`margin-inline-end: ${l.right}in`);
  const hang = l.first && l.first < 0 ? -l.first : 0;
  if (l.first) out.push(`text-indent: ${l.first}in`);
  const b = l.borders ?? {};
  for (const s of BORDER_SIDES) {
    const x = b[s];
    if (x) out.push(`border-${s}: ${x.width}pt solid ${x.color}`);
  }
  if (b.top) out.push(`margin-top: var(--pd-sb, 0pt)`, `padding-top: ${BORDER_GAP.top}pt`);
  if (b.bottom) out.push(`padding-bottom: ${BORDER_GAP.bottom}pt`);
  // The hang pads the start side: the right in right-to-left text.
  const pad = { left: b.left ? BORDER_GAP.left : 0, right: b.right ? BORDER_GAP.right : 0 };
  pad[l.dir === "rtl" ? "right" : "left"] += hang * 72;
  if (pad.left) out.push(`padding-left: ${pad.left}pt`);
  if (pad.right) out.push(`padding-right: ${pad.right}pt`);
  if (l.shading) out.push(`background-color: ${l.shading}`);
  return out.join("; ");
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Where a paragraph's first line and its other lines start, in inches from the margin, as Word's ruler and
 * Paragraph dialog show them. `indent` is the block's indent attribute (half-inch steps); a hang pads the
 * start side, so the first line of a hanging paragraph starts at the indent and the others a hang further in.
 */
export function indentPositions(indent: unknown, first: number | undefined): { first: number; body: number } {
  const start = (Number(indent) || 0) * 0.5;
  const f = first ?? 0;
  const hang = f < 0 ? -f : 0;
  return { first: r3(start + hang + f), body: r3(start + hang) };
}

/** The indent attribute and first-line offset that put the first line and the other lines where asked. */
export function indentFromPositions(first: number, body: number): { indent: number; first: number } {
  return { indent: r3(Math.min(first, body) * 2), first: r3(first - body) };
}

/** The CSS for a paragraph's line spacing: a multiple, or points exactly or at least. */
export function lineHeightCss(lineHeight: unknown, l: ParaLayout | null): string {
  const v = Number(lineHeight);
  if (!lineHeight || !Number.isFinite(v) || v <= 0) return "";
  if (l?.lineRule === "exact") return `line-height: ${v}pt`;
  if (l?.lineRule === "atLeast") return `line-height: max(${v}pt, 1.15em)`;
  return `line-height: ${v}`;
}

/** A tab character (U46): its width is set where it sits, to reach the next tab stop. */
export const Tab = Node.create({
  name: "tab",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  parseHTML: () => [{ tag: 'span[data-type="tab"]' }],
  renderHTML: () => ["span", { "data-type": "tab", class: "pd-tab" }, "\t"],
  renderText: () => "\t",
});

/** Word's default stops: every half inch. */
export const DEFAULT_TAB_STEP = 0.5;

/**
 * Where a tab ends (U46): `x` is where it starts, in inches from the left margin; `after` is the width
 * of the text after it up to the next tab, and `decimal` the width of that text up to its decimal point.
 * Returns the stop it reaches and the tab's width. A stop the text can't reach is passed over, as in Word.
 */
export function tabTo(x: number, stops: readonly TabStop[], after: number, decimal: number, min = 0.01): { stop: TabStop; width: number } {
  for (const s of stops) {
    if (s.pos <= x + 0.001) continue;
    const pull = s.align === "right" ? after : s.align === "center" ? after / 2 : s.align === "decimal" ? decimal : 0;
    const width = s.pos - x - pull;
    if (width >= min) return { stop: s, width };
  }
  const pos = (Math.floor(x / DEFAULT_TAB_STEP + 0.001) + 1) * DEFAULT_TAB_STEP;
  return { stop: { pos, align: "left", leader: "none" }, width: pos - x };
}

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const NUMBER = /^[-+]?[$€£¥]?\s*[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?%?$/;

/** Sort order for text (U50): numbers in number order, then words as a person reads them. */
export function compareText(a: string, b: string): number {
  const x = a.trim();
  const y = b.trim();
  const nx = NUMBER.test(x) && /\d/.test(x) ? Number(x.replace(/[$€£¥,%\s]/g, "")) : NaN;
  const ny = NUMBER.test(y) && /\d/.test(y) ? Number(y.replace(/[$€£¥,%\s]/g, "")) : NaN;
  if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx - ny;
  if (!Number.isNaN(nx)) return -1;
  if (!Number.isNaN(ny)) return 1;
  return COLLATOR.compare(x, y);
}

/** The order to put items in by their keys: A to Z, or Z to A; ties keep their order. */
export function sortOrder(keys: readonly string[], descending = false): number[] {
  return keys
    .map((k, i) => [k, i] as const)
    .sort((p, q) => (descending ? compareText(q[0], p[0]) : compareText(p[0], q[0])) || p[1] - q[1])
    .map(([, i]) => i);
}
