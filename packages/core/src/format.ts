/** The P-Doc file format (`*.pdoc.json`): readable JSON, pretty-printed so Git diffs read well. */
import type { JSONContent } from "@tiptap/core";

export const FORMAT = "p-doc";
/** 2: images live beside the document as `assets/<sha256>.<ext>` (stage 7); 1 kept them inline. */
export const FORMAT_VERSION = 2;

export type PaperSize = "letter" | "legal" | "a4" | "a5" | "tabloid";
export type Orientation = "portrait" | "landscape";
export type PageMode = "pages" | "pageless";
export type TextWidth = "narrow" | "medium" | "wide" | "full";
export type HfAlign = "left" | "center" | "right";

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
  headerAlign: HfAlign;
  footerAlign: HfAlign;
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
  version: number;
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
    headerAlign: "left",
    footerAlign: "center",
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

/** A file written by a later P-Doc: this build lists it but never opens it for editing or rewrites it (A18). */
export class NewerFormatError extends FormatError {
  constructor(
    readonly version: number,
    readonly title: string,
  ) {
    super("Made with a newer P-Doc. Update to edit it.");
  }
}

/** The format version a file's text declares, read without parsing it all (null if none). */
export function declaredVersion(text: string): number | null {
  const m = /"version"\s*:\s*(\d+)/.exec(text.slice(0, 4096));
  return m ? Number(m[1]) : null;
}

/** Reads a document, filling settings a writer of an earlier P-Doc left out. Throws FormatError. */
/** A page setup from a file or another process: known values kept, anything else the default. */
export function cleanPage(raw: unknown): PageSetup {
  const d = defaultPage();
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const m = (p.margins && typeof p.margins === "object" ? p.margins : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, ok: readonly T[], def: T): T => (ok.includes(v as T) ? (v as T) : def);
  const inches = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10 ? v : def);
  const text = (v: unknown, def: string) => (typeof v === "string" ? v.slice(0, 500) : def);
  const aligns = ["left", "center", "right"] as const;
  return {
    mode: pick(p.mode, ["pages", "pageless"], d.mode),
    size: pick(p.size, Object.keys(PAPER) as PaperSize[], d.size),
    orientation: pick(p.orientation, ["portrait", "landscape"], d.orientation),
    margins: { top: inches(m.top, d.margins.top), bottom: inches(m.bottom, d.margins.bottom), left: inches(m.left, d.margins.left), right: inches(m.right, d.margins.right) },
    color: typeof p.color === "string" && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : d.color,
    textWidth: pick(p.textWidth, Object.keys(TEXT_WIDTH) as TextWidth[], d.textWidth),
    header: text(p.header, d.header),
    footer: text(p.footer, d.footer),
    headerAlign: pick(p.headerAlign, aligns, d.headerAlign),
    footerAlign: pick(p.footerAlign, aligns, d.footerAlign),
    differentFirstPage: typeof p.differentFirstPage === "boolean" ? p.differentFirstPage : d.differentFirstPage,
    firstHeader: text(p.firstHeader, d.firstHeader),
    firstFooter: text(p.firstFooter, d.firstFooter),
  };
}

/**
 * Reads a document. A file from a newer P-Doc throws NewerFormatError, unless `allowNewer`: then it is
 * read as far as this build understands it, keeping its own `version`, for showing read-only.
 */
export function parseDocument(text: string, o: { allowNewer?: boolean } = {}): PDocFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new FormatError(`Not JSON: ${(e as Error).message}`);
  }
  const d = raw as Partial<PDocFile>;
  if (!d || typeof d !== "object" || d.format !== FORMAT) throw new FormatError("Not a P-Doc document");
  if (typeof d.version !== "number") throw new FormatError("No format version");
  if (d.version > FORMAT_VERSION && !o.allowNewer) throw new NewerFormatError(d.version, typeof d.title === "string" && d.title.trim() ? d.title : "Untitled document");
  if (typeof d.id !== "string" || !d.id) throw new FormatError("No document id");
  if (!d.content || (d.content as JSONContent).type !== "doc") throw new FormatError("No content");
  const styles = defaultStyles();
  for (const k of STYLE_KEYS) if (d.styles?.[k]) styles[k] = { ...styles[k], ...d.styles[k] };
  return {
    format: FORMAT,
    version: Math.max(FORMAT_VERSION, d.version),
    id: d.id,
    title: typeof d.title === "string" && d.title.trim() ? d.title : "Untitled document",
    created: typeof d.created === "string" ? d.created : new Date(0).toISOString(),
    page: cleanPage(d.page),
    styles,
    content: d.content as JSONContent,
    comments: Array.isArray(d.comments) ? d.comments : [],
  };
}

export function serializeDocument(doc: PDocFile): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * A newer P-Doc's content as this build can show it: node and mark types it doesn't know are left
 * out, and an unknown node with content gives way to its children. For showing only: such a file is
 * never written (A18).
 */
export function knownContent(content: JSONContent, nodes: ReadonlySet<string>, marks: ReadonlySet<string>): JSONContent {
  const walk = (n: JSONContent): JSONContent[] => {
    const kids = n.content?.flatMap(walk);
    if (!n.type || !nodes.has(n.type)) return kids ?? [];
    const out: JSONContent = { ...n };
    if (kids) out.content = kids;
    if (n.marks) out.marks = n.marks.filter((m) => marks.has(m.type));
    return [out];
  };
  return walk(content)[0] ?? emptyContent();
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
