/**
 * Sections (U55, spec §4.13): a section break block ends one section and starts the next on the next
 * page, the next odd or even page, or on the same page (continuous). The break carries the page
 * geometry of the section it starts (paper, orientation, margins); without one, the section keeps the
 * geometry before it. The document's own page setup is the first section's.
 */
import { Node, type JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { cleanNumFormat, pageNumberText, HF_FIELDS, hfFor, hfTextsOf, PAPER, type HfTexts, type Margins, type NumFormat, type Orientation, type PageSetup, type PaperSize } from "./format.ts";

export type SectionStart = "next" | "continuous" | "odd" | "even";
export const SECTION_STARTS: readonly SectionStart[] = ["next", "continuous", "odd", "even"];
export const SECTION_LABEL: Record<SectionStart, string> = {
  next: "Section break (next page)",
  continuous: "Section break (continuous)",
  odd: "Section break (odd page)",
  even: "Section break (even page)",
};

/** A section's own page geometry, in inches. */
export interface SectionPage {
  size: PaperSize;
  orientation: Orientation;
  margins: Margins;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 40;

/** A section's page geometry from stored data, or null when it has none (or it isn't valid). */
export function cleanSectionPage(raw: unknown): SectionPage | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const m = (p.margins ?? {}) as Record<string, unknown>;
  if (!(typeof p.size === "string" && p.size in PAPER)) return null;
  if (p.orientation !== "portrait" && p.orientation !== "landscape") return null;
  if (!num(m.top) || !num(m.bottom) || !num(m.left) || !num(m.right)) return null;
  return { size: p.size as PaperSize, orientation: p.orientation, margins: { top: m.top, bottom: m.bottom, left: m.left, right: m.right } };
}

export const sectionPageOf = (p: PageSetup): SectionPage => ({ size: p.size, orientation: p.orientation, margins: { ...p.margins } });

/** A section's own headers and footers; null when it is linked to the previous section's (U57). */
export function cleanHfTexts(raw: unknown): HfTexts | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const out = {} as HfTexts;
  for (const k of HF_FIELDS) out[k] = typeof p[k] === "string" ? (p[k] as string).slice(0, 500) : "";
  return out;
}

/** A section's page numbers: its format (null: the previous section's) and start (null: continue). */
export interface SectionNumbering {
  format: NumFormat | null;
  start: number | null;
}

export function cleanNumbering(raw: unknown): SectionNumbering | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const start = typeof p.start === "number" && Number.isInteger(p.start) && p.start >= 0 && p.start <= 9999 ? p.start : null;
  const format = p.format == null ? null : cleanNumFormat(p.format);
  return format == null && start == null ? null : { format, start };
}

const jsonAttr = <T>(name: string, clean: (v: unknown) => T | null) => ({
  default: null,
  parseHTML: (el: HTMLElement) => {
    try {
      return clean(JSON.parse(el.getAttribute(`data-${name}`) ?? "null"));
    } catch {
      return null;
    }
  },
  renderHTML: (a: Record<string, unknown>) => (a[name] ? { [`data-${name}`]: JSON.stringify(a[name]) } : {}),
});

const cleanStart = (v: unknown): SectionStart => (SECTION_STARTS.includes(v as SectionStart) ? (v as SectionStart) : "next");

/** A section break: a labelled line on screen that takes no room and doesn't print. */
export const SectionBreak = Node.create({
  name: "sectionBreak",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      kind: {
        default: "next",
        parseHTML: (el) => cleanStart(el.getAttribute("data-kind")),
        renderHTML: (a) => ({ "data-kind": a.kind, "data-label": SECTION_LABEL[cleanStart(a.kind)] }),
      },
      page: jsonAttr("page", cleanSectionPage),
      hf: jsonAttr("hf", cleanHfTexts),
      numbering: jsonAttr("numbering", cleanNumbering),
    };
  },
  parseHTML: () => [{ tag: 'div[data-type="section-break"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", { ...HTMLAttributes, "data-type": "section-break", class: "pd-section-break" }],
});

export interface Section {
  /** Index of the section's first top-level block (after its break). */
  from: number;
  /** Index of the break that starts it; null for the first section. */
  breakAt: number | null;
  start: SectionStart;
  /** The page setup the section's pages use. */
  page: PageSetup;
  /** The headers and footers its pages show, and whether they are its own (not linked to the previous). */
  hf: HfTexts;
  ownHf: boolean;
  /** Its page number format, and the number it starts at (null: continues from the previous section). */
  format: NumFormat;
  numStart: number | null;
}

type Top = { type: string; attrs?: Record<string, unknown> };

/** The document's sections, in order; the first uses the document's page setup. */
export function sectionsOf(doc: PMNode | JSONContent, base: PageSetup): Section[] {
  const tops: Top[] = [];
  if ("forEach" in doc && typeof (doc as PMNode).forEach === "function") (doc as PMNode).forEach((n) => void tops.push({ type: n.type.name, attrs: n.attrs }));
  else for (const n of (doc as JSONContent).content ?? []) tops.push({ type: n.type ?? "", attrs: n.attrs });
  const out: Section[] = [{ from: 0, breakAt: null, start: "next", page: base, hf: hfTextsOf(base), ownHf: true, format: base.numFormat, numStart: base.numStart }];
  tops.forEach((n, i) => {
    if (n.type !== "sectionBreak") return;
    const before = out[out.length - 1]!;
    const prev = before.page;
    const own = cleanSectionPage(n.attrs?.page);
    const hf = cleanHfTexts(n.attrs?.hf);
    const num = cleanNumbering(n.attrs?.numbering);
    out.push({
      from: i + 1,
      breakAt: i,
      start: cleanStart(n.attrs?.kind),
      page: own ? { ...prev, ...own, margins: { ...own.margins } } : prev,
      hf: hf ?? before.hf,
      ownHf: !!hf,
      format: num?.format ?? before.format,
      numStart: num?.start ?? null,
    });
  });
  return out;
}

/** What a page shows: its section, its number (and as written), its header and footer (U57). */
export interface PageFace {
  section: number;
  number: number;
  label: string;
  header: string;
  footer: string;
}

/**
 * The faces of a document's pages, given each page's section in order (blank pages included): numbers
 * run on from section to section unless a section starts at its own; the first page of each section is
 * its first page for "Different first page".
 */
export function pageFaces(base: PageSetup, sections: readonly Section[], sectionOfPage: readonly number[]): PageFace[] {
  const out: PageFace[] = [];
  const count = sectionOfPage.length;
  let number = 0;
  sectionOfPage.forEach((k, i) => {
    const sec = sections[k] ?? sections[0]!;
    const first = i === 0 || sectionOfPage[i - 1] !== k;
    number = first && sec.numStart != null ? sec.numStart : number + 1;
    const o = { number, label: pageNumberText(number, sec.format), first, count };
    out.push({ section: k, number, label: o.label, header: hfFor(base, sec.hf, "header", o), footer: hfFor(base, sec.hf, "footer", o) });
  });
  return out;
}

/** The index of the section a top-level block is in (a break belongs to the section it ends). */
export function sectionIndexAt(sections: readonly Section[], block: number): number {
  let k = 0;
  while (k + 1 < sections.length && sections[k + 1]!.from <= block) k++;
  return k;
}
