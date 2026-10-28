/** The P-Doc file format (`*.pdoc.json`): readable JSON, pretty-printed so Git diffs read well. */
import type { JSONContent } from "@tiptap/core";

export const FORMAT = "p-doc";
export const FORMAT_VERSION = 1;

export type PaperSize = "letter" | "legal" | "a4" | "a5" | "tabloid";
export type Orientation = "portrait" | "landscape";
export type PageMode = "pages" | "pageless";
export type TextWidth = "narrow" | "medium" | "wide" | "full";

/** Paper sizes in inches (portrait). */
export const PAPER: Record<PaperSize, { label: string; width: number; height: number }> = {
  letter: { label: "Letter (8.5 × 11 in)", width: 8.5, height: 11 },
  legal: { label: "Legal (8.5 × 14 in)", width: 8.5, height: 14 },
  a4: { label: "A4 (21 × 29.7 cm)", width: 210 / 25.4, height: 297 / 25.4 },
  a5: { label: "A5 (14.8 × 21 cm)", width: 148 / 25.4, height: 210 / 25.4 },
  tabloid: { label: "Tabloid (11 × 17 in)", width: 11, height: 17 },
};

/** Pageless text widths in CSS pixels (null = the full window). */
export const TEXT_WIDTH: Record<TextWidth, number | null> = { narrow: 640, medium: 800, wide: 960, full: null };

export interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PageSetup {
  mode: PageMode;
  size: PaperSize;
  orientation: Orientation;
  /** Inches. */
  margins: Margins;
  /** Page colour, a #rrggbb value. */
  color: string;
  textWidth: TextWidth;
  /** Header and footer text; `{page}` and `{pages}` stand for the page number and count. */
  header: string;
  footer: string;
  differentFirstPage: boolean;
  firstHeader: string;
  firstFooter: string;
}

export interface StyleDef {
  fontFamily: string;
  /** Points. */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  lineHeight: number;
  /** Points. */
  spaceBefore: number;
  spaceAfter: number;
}

export const STYLE_KEYS = ["normal", "title", "subtitle", "heading1", "heading2", "heading3", "heading4"] as const;
export type StyleKey = (typeof STYLE_KEYS)[number];
export type Styles = Record<StyleKey, StyleDef>;

export const STYLE_LABELS: Record<StyleKey, string> = {
  normal: "Normal text",
  title: "Title",
  subtitle: "Subtitle",
  heading1: "Heading 1",
  heading2: "Heading 2",
  heading3: "Heading 3",
  heading4: "Heading 4",
};

export interface CommentReply {
  id: string;
  author: string;
  created: string;
  body: string;
  edited?: string;
}

export interface CommentThread extends CommentReply {
  resolved: boolean;
  /** The quoted text when the thread was made, shown when its text is deleted. */
  quote: string;
  replies: CommentReply[];
}

export interface PDocFile {
  format: typeof FORMAT;
  version: typeof FORMAT_VERSION;
  id: string;
  title: string;
  created: string;
  page: PageSetup;
  styles: Styles;
  content: JSONContent;
  comments: CommentThread[];
}

export const SANS = "Aptos, Calibri, 'Segoe UI', system-ui, sans-serif";

export function defaultStyles(): Styles {
  const base = (o: Partial<StyleDef>): StyleDef => ({ fontFamily: SANS, fontSize: 11, bold: false, italic: false, color: "", lineHeight: 1.15, spaceBefore: 0, spaceAfter: 8, ...o });
  return {
    normal: base({}),
    title: base({ fontSize: 26, spaceAfter: 3 }),
    subtitle: base({ fontSize: 15, color: "#666666", spaceAfter: 16 }),
    heading1: base({ fontSize: 20, spaceBefore: 20, spaceAfter: 6 }),
    heading2: base({ fontSize: 16, spaceBefore: 18, spaceAfter: 6 }),
    heading3: base({ fontSize: 14, color: "#434343", spaceBefore: 16, spaceAfter: 4 }),
    heading4: base({ fontSize: 12, color: "#666666", spaceBefore: 14, spaceAfter: 4 }),
  };
}

/** Letter in the United States and nearby, A4 elsewhere. */
export function defaultPaper(locale = "en-US"): PaperSize {
  return /-(US|CA|MX|PH|CL|CO|VE|GT|PR)$/i.test(locale) || locale === "en" ? "letter" : "a4";
}

export function defaultPage(locale?: string): PageSetup {
  return {
    mode: "pages",
    size: defaultPaper(locale),
    orientation: "portrait",
    margins: { top: 1, bottom: 1, left: 1, right: 1 },
    color: "#ffffff",
    textWidth: "medium",
    header: "",
    footer: "",
    differentFirstPage: false,
    firstHeader: "",
    firstFooter: "",
  };
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function emptyContent(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export interface CreateOptions {
  title?: string;
  page?: PageSetup;
  styles?: Styles;
  content?: JSONContent;
  id?: string;
  now?: Date;
}

export function createDocument(o: CreateOptions = {}): PDocFile {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    id: o.id ?? newId(),
    title: o.title?.trim() || "Untitled document",
    created: (o.now ?? new Date()).toISOString(),
    page: structuredClone(o.page ?? defaultPage()),
    styles: structuredClone(o.styles ?? defaultStyles()),
    content: o.content ?? emptyContent(),
    comments: [],
  };
}

export class FormatError extends Error {}

/** Reads a document, filling settings a writer of an earlier P-Doc left out. Throws FormatError. */
export function parseDocument(text: string): PDocFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new FormatError(`Not JSON: ${(e as Error).message}`);
  }
  const d = raw as Partial<PDocFile>;
  if (!d || typeof d !== "object" || d.format !== FORMAT) throw new FormatError("Not a P-Doc document");
  if (typeof d.version !== "number" || d.version > FORMAT_VERSION) throw new FormatError(`Made by a newer P-Doc (format ${String(d.version)})`);
  if (typeof d.id !== "string" || !d.id) throw new FormatError("No document id");
  if (!d.content || (d.content as JSONContent).type !== "doc") throw new FormatError("No content");
  const styles = defaultStyles();
  for (const k of STYLE_KEYS) if (d.styles?.[k]) styles[k] = { ...styles[k], ...d.styles[k] };
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    id: d.id,
    title: typeof d.title === "string" && d.title.trim() ? d.title : "Untitled document",
    created: typeof d.created === "string" ? d.created : new Date(0).toISOString(),
    page: { ...defaultPage(), ...(d.page ?? {}), margins: { ...defaultPage().margins, ...(d.page?.margins ?? {}) } },
    styles,
    content: d.content as JSONContent,
    comments: Array.isArray(d.comments) ? d.comments : [],
  };
}

export function serializeDocument(doc: PDocFile): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function slug(title: string): string {
  const s = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return s || "untitled";
}

/** `docs/<slug>-<id8>.pdoc.json` relative to a repository. */
export function documentPath(doc: Pick<PDocFile, "id" | "title">): string {
  return `docs/${slug(doc.title)}-${doc.id.replace(/-/g, "").slice(0, 8)}.pdoc.json`;
}

/** Page size in inches, after orientation. */
export function pageInches(page: PageSetup): { width: number; height: number } {
  const p = PAPER[page.size];
  return page.orientation === "landscape" ? { width: p.height, height: p.width } : { width: p.width, height: p.height };
}

/** Header or footer text for a page, with tokens filled. */
export function headerFooterText(page: PageSetup, which: "header" | "footer", n: number, count: number): string {
  const t = page.differentFirstPage && n === 1 ? (which === "header" ? page.firstHeader : page.firstFooter) : page[which];
  return t.replaceAll("{page}", String(n)).replaceAll("{pages}", String(count));
}
