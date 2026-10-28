/** Word (.docx) export and import (U17, U18). Node only: used by the main process and the CLI. */
import type { JSONContent } from "@tiptap/core";
import {
  AlignmentType,
  Bookmark as DocxBookmark,
  BorderStyle,
  DeletedTextRun,
  Document,
  EndnoteReferenceRun,
  FootnoteReferenceRun,
  ExternalHyperlink,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  InsertedTextRun,
  InternalHyperlink,
  LeaderType,
  LevelFormat,
  LineRuleType,
  PageBreak,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Tab as DocxTab,
  TabStopType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  TextWrappingSide,
  TextWrappingType,
  VerticalPositionRelativeFrom,
  WidthType,
  type IParagraphOptions,
  type ParagraphChild,
} from "docx";
import mammoth from "mammoth";
import { PAPER, type PDocFile, type StyleDef } from "./format.ts";
import { fromHTML } from "./convert.ts";
import { nodeText } from "./outline.ts";
import { notesListOf } from "./notes.ts";
import { anchorsOfJSON, wordBookmarkName } from "./refs.ts";
import { BORDER_SIDES, cleanLayout } from "./paragraph.ts";
import { cleanCrop, dataImageParts, imageInfo } from "./image.ts";

type Mark = NonNullable<JSONContent["marks"]>[number];

const TWIP = 1440;
const hex = (c: string | undefined | null) => (c && /^#?[0-9a-f]{6}$/i.test(c) ? c.replace("#", "").toUpperCase() : undefined);

/** Points from a CSS size ("12pt", "16px"). */
function points(v: unknown): number | undefined {
  const m = /^([\d.]+)(pt|px)?$/.exec(String(v ?? ""));
  if (!m) return undefined;
  const n = Number(m[1]);
  return m[2] === "px" ? n * 0.75 : n;
}

/** Width and height of a PNG, JPEG, GIF or BMP (Word takes these four). */
export function imageSize(buf: Uint8Array): { width: number; height: number; type: "png" | "jpg" | "gif" | "bmp" } | null {
  const i = imageInfo(buf);
  return i && i.type !== "webp" && i.type !== "svg" ? { width: i.width, height: i.height, type: i.type } : null;
}

interface Ctx {
  doc: PDocFile;
  listInstance: number;
  revision: number;
  maxImageWidth: number;
  /** Word's id of each note (footnotes and endnotes count separately). */
  noteIds: Map<string, { kind: "footnote" | "endnote"; num: number }>;
  /** Word's bookmark name of each heading and bookmark, by id. */
  anchors: Map<string, string>;
}

function runs(nodes: JSONContent[] | undefined, ctx: Ctx, extra: { font?: string } = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      out.push(new TextRun({ text: "", break: 1 }));
      continue;
    }
    if (n.type === "tab") {
      out.push(new TextRun({ children: [new DocxTab()] }));
      continue;
    }
    if (n.type === "image") {
      const img = imageRun(n, ctx);
      if (img) out.push(img);
      continue;
    }
    if (n.type === "bookmark") {
      const name = ctx.anchors.get(String(n.attrs?.id ?? ""));
      if (name) out.push(new DocxBookmark({ id: name, children: [] }));
      continue;
    }
    if (n.type === "noteRef") {
      const note = ctx.noteIds.get(String(n.attrs?.id ?? ""));
      if (note) out.push(note.kind === "endnote" ? new EndnoteReferenceRun(note.num) : new FootnoteReferenceRun(note.num));
      continue;
    }
    if (n.type !== "text") continue;
    const marks = (n.marks ?? []) as Mark[];
    const has = (t: string) => marks.some((m) => m.type === t);
    const style = marks.find((m) => m.type === "textStyle")?.attrs ?? {};
    const highlight = marks.find((m) => m.type === "highlight")?.attrs?.color as string | undefined;
    const opts = {
      text: n.text ?? "",
      bold: has("bold") || undefined,
      italics: has("italic") || undefined,
      underline: has("underline") ? {} : undefined,
      strike: has("strike") || undefined,
      superScript: has("superscript") || undefined,
      subScript: has("subscript") || undefined,
      font: (style.fontFamily as string | undefined)?.split(",")[0]?.replace(/['"]/g, "").trim() ?? extra.font,
      size: points(style.fontSize) ? Math.round(points(style.fontSize)! * 2) : undefined,
      color: hex(style.color as string),
      shading: has("highlight") ? { type: ShadingType.CLEAR, fill: hex(highlight) ?? "FFF59D", color: "auto" } : undefined,
      style: has("link") ? "Hyperlink" : undefined,
    };
    const ins = marks.find((m) => m.type === "insertion");
    const del = marks.find((m) => m.type === "deletion");
    let run: ParagraphChild;
    if (ins) run = new InsertedTextRun({ ...opts, id: ctx.revision++, author: String(ins.attrs?.author || "P-Doc"), date: String(ins.attrs?.time || new Date().toISOString()) });
    else if (del) run = new DeletedTextRun({ ...opts, id: ctx.revision++, author: String(del.attrs?.author || "P-Doc"), date: String(del.attrs?.time || new Date().toISOString()) });
    else run = new TextRun(opts);
    const link = marks.find((m) => m.type === "link");
    const href = String(link?.attrs?.href ?? "");
    const anchor = href.startsWith("#") ? ctx.anchors.get(href.slice(1)) : undefined;
    if (anchor) out.push(new InternalHyperlink({ anchor, children: [run] }));
    else if (link && /^(https?:|mailto:)/i.test(href)) out.push(new ExternalHyperlink({ link: href, children: [run] }));
    else out.push(run);
  }
  return out;
}

/**
 * An image as Word lays it out (U40): its width, crop (Word trims the same share of each edge) and,
 * when text wraps around it, a floating picture on that side with square wrapping.
 */
function imageRun(n: JSONContent, ctx: Ctx): ImageRun | null {
  const a = n.attrs ?? {};
  const bytes = dataImageParts(String(a.src ?? ""))?.bytes;
  if (!bytes) return null;
  const size = imageSize(bytes);
  if (!size) return null;
  const crop = cleanCrop(a.crop);
  const shownW = size.width * (crop?.w ?? 1);
  const shownH = size.height * (crop?.h ?? 1);
  const wanted = typeof a.width === "number" && a.width > 0 ? a.width : shownW;
  const width = Math.max(1, Math.round(Math.min(wanted, ctx.maxImageWidth)));
  const freed = typeof a.width === "number" && a.width > 0 && typeof a.height === "number" && a.height > 0 ? a.height : null;
  const height = Math.max(1, Math.round(freed ? (freed * width) / wanted : (width * shownH) / Math.max(1, shownW)));
  const alt = String(a.alt ?? "");
  const pct = (v: number) => Math.max(0, Math.min(100, +(v * 100).toFixed(3)));
  const wrap = a.wrap === "left" || a.wrap === "right" ? a.wrap : null;
  return new ImageRun({
    type: size.type,
    data: bytes,
    transformation: { width, height },
    altText: { name: "image", title: alt, description: alt },
    ...(crop ? { crop: { left: pct(crop.x), top: pct(crop.y), right: pct(1 - crop.x - crop.w), bottom: pct(1 - crop.y - crop.h) } } : {}),
    ...(wrap
      ? {
          floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN, align: wrap === "left" ? HorizontalPositionAlign.LEFT : HorizontalPositionAlign.RIGHT },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 },
            wrap: { type: TextWrappingType.SQUARE, side: wrap === "left" ? TextWrappingSide.RIGHT : TextWrappingSide.LEFT },
            margins: wrap === "left" ? { right: 152400, bottom: 76200 } : { left: 152400, bottom: 76200 },
          },
        }
      : {}),
  });
}

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };
const HEADING = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

const LEADER = { none: undefined, dots: LeaderType.DOT, dashes: LeaderType.HYPHEN, line: LeaderType.UNDERSCORE } as const;
const TAB_TYPE = { left: TabStopType.LEFT, center: TabStopType.CENTER, right: TabStopType.RIGHT, decimal: TabStopType.DECIMAL } as const;

/** A paragraph's layout as Word writes it (U44–U47): indents, spacing, breaks, borders, shading, direction and tab stops. */
function paraOptions(n: JSONContent): Partial<IParagraphOptions> {
  const a = n.attrs ?? {};
  const l = cleanLayout(a.layout);
  const o: Record<string, unknown> = {};
  if (a.textAlign && ALIGN[a.textAlign]) o.alignment = ALIGN[a.textAlign];
  // A hanging indent in Word sets the other lines' indent and pulls the first line back by the hang.
  const hang = l?.first && l.first < 0 ? -l.first : 0;
  const indent: Record<string, number> = {};
  const left = Number(a.indent ?? 0) * 0.5 + hang;
  if (left) indent.left = Math.round(left * TWIP);
  if (l?.right) indent.right = Math.round(l.right * TWIP);
  if (hang) indent.hanging = Math.round(hang * TWIP);
  else if (l?.first) indent.firstLine = Math.round(l.first * TWIP);
  if (Object.keys(indent).length) o.indent = indent;
  const spacing: Record<string, unknown> = {};
  if (a.lineHeight) {
    if (l?.lineRule) Object.assign(spacing, { line: Math.round(Number(a.lineHeight) * 20), lineRule: l.lineRule === "exact" ? LineRuleType.EXACT : LineRuleType.AT_LEAST });
    else spacing.line = Math.round(Number(a.lineHeight) * 240);
  }
  if (a.spaceBefore != null) spacing.before = Math.round(Number(a.spaceBefore) * 20);
  if (a.spaceAfter != null) spacing.after = Math.round(Number(a.spaceAfter) * 20);
  if (Object.keys(spacing).length) o.spacing = spacing;
  if (!l) return o as Partial<IParagraphOptions>;
  if (l.keepNext) o.keepNext = true;
  if (l.keepLines) o.keepLines = true;
  if (l.breakBefore) o.pageBreakBefore = true;
  if (l.widows === false) o.widowControl = false;
  if (l.borders) {
    const border: Record<string, unknown> = {};
    for (const side of BORDER_SIDES) {
      const b = l.borders[side];
      if (b) border[side] = { style: BorderStyle.SINGLE, size: Math.round(b.width * 8), color: hex(b.color), space: side === "top" || side === "bottom" ? 1 : 4 };
    }
    o.border = border;
  }
  if (l.shading) o.shading = { type: ShadingType.CLEAR, fill: hex(l.shading), color: "auto" };
  if (l.dir === "rtl") o.bidirectional = true;
  if (l.tabs) o.tabStops = l.tabs.map((t) => ({ type: TAB_TYPE[t.align], position: Math.round(t.pos * TWIP), ...(LEADER[t.leader] ? { leader: LEADER[t.leader] } : {}) }));
  return o as Partial<IParagraphOptions>;
}

function blocks(nodes: JSONContent[] | undefined, ctx: Ctx, list?: { ref: string; level: number; instance: number }): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const n of nodes ?? []) {
    switch (n.type) {
      case "paragraph": {
        const ts = n.attrs?.textStyle;
        out.push(
          new Paragraph({
            ...paraOptions(n),
            ...(ts === "title" ? { heading: HeadingLevel.TITLE } : ts === "subtitle" ? { style: "Subtitle" } : {}),
            ...(list ? { numbering: { reference: list.ref, level: list.level, instance: list.instance } } : {}),
            children: runs(n.content, ctx),
          }),
        );
        list = list && { ...list, ref: list.ref };
        break;
      }
      case "heading": {
        const name = ctx.anchors.get(String(n.attrs?.id ?? ""));
        const children = runs(n.content, ctx);
        out.push(new Paragraph({ ...paraOptions(n), heading: HEADING[Number(n.attrs?.level ?? 1) - 1], children: name ? [new DocxBookmark({ id: name, children })] : children }));
        break;
      }
      case "blockquote":
        for (const c of blocks(n.content, ctx)) {
          out.push(c);
        }
        break;
      case "codeBlock":
        for (const line of nodeText(n).split("\n")) out.push(new Paragraph({ style: "Code", children: [new TextRun({ text: line, font: "Consolas" })] }));
        break;
      case "horizontalRule":
        out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } }, children: [] }));
        break;
      case "pageBreak":
        out.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case "sectionBreak":
        // Until sections are written as Word's own (11.3), one that starts a page keeps the page.
        if (n.attrs?.kind !== "continuous") out.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case "notes":
        // Written as Word's own footnotes and endnotes (see toDocx).
        break;
      case "image": {
        const img = imageRun(n, ctx);
        const wraps = n.attrs?.wrap === "left" || n.attrs?.wrap === "right";
        if (img) out.push(new Paragraph({ alignment: wraps ? undefined : ALIGN[String(n.attrs?.align ?? "center")], children: [img] }));
        else if (n.attrs?.alt) out.push(new Paragraph({ children: [new TextRun({ text: `[${String(n.attrs.alt)}]`, italics: true })] }));
        break;
      }
      case "tableOfContents": {
        out.push(new Paragraph({ style: "TOCHeading", children: [new TextRun({ text: "Contents", bold: true })] }));
        // Each entry links to its heading's bookmark, as Word's own contents do.
        for (const e of (n.attrs?.entries ?? []) as { level: number; text: string; id: string }[]) {
          const anchor = ctx.anchors.get(e.id);
          const text = new TextRun({ text: e.text, style: anchor ? "Hyperlink" : undefined });
          out.push(new Paragraph({ indent: { left: (e.level - 1) * 360 }, children: [anchor ? new InternalHyperlink({ anchor, children: [text] }) : text] }));
        }
        break;
      }
      case "bulletList":
      case "orderedList":
      case "taskList": {
        const ref = n.type === "orderedList" ? "pd-numbers" : "pd-bullets";
        const level = list ? list.level + 1 : 0;
        const instance = n.type === "orderedList" ? ++ctx.listInstance : 0;
        for (const item of n.content ?? []) {
          const [first, ...rest] = item.content ?? [];
          const prefix = n.type === "taskList" ? [new TextRun(item.attrs?.checked ? "☒ " : "☐ ")] : [];
          out.push(new Paragraph({ ...(first ? paraOptions(first) : {}), numbering: { reference: ref, level, instance }, children: [...prefix, ...runs(first?.content, ctx)] }));
          out.push(...blocks(rest, ctx, { ref, level, instance }));
        }
        break;
      }
      case "table": {
        const rows = (n.content ?? []).map(
          (r) =>
            new TableRow({
              tableHeader: (r.content ?? []).every((c) => c.type === "tableHeader") || undefined,
              children: (r.content ?? []).map(
                (c) =>
                  new TableCell({
                    columnSpan: Number(c.attrs?.colspan ?? 1) > 1 ? Number(c.attrs?.colspan) : undefined,
                    rowSpan: Number(c.attrs?.rowspan ?? 1) > 1 ? Number(c.attrs?.rowspan) : undefined,
                    children: blocks(c.content, ctx).filter((b): b is Paragraph => b instanceof Paragraph).concat([]) as Paragraph[],
                  }),
              ),
            }),
        );
        if (rows.length) out.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
        break;
      }
      default:
        if (n.content) out.push(...blocks(n.content, ctx, list));
    }
  }
  return out;
}

function hfParagraph(text: string): Paragraph {
  const children: (TextRun | string)[] = [];
  const parts = text.split(/(\{page\}|\{pages\})/);
  for (const p of parts) {
    if (p === "{page}") children.push(new TextRun({ children: [PageNumber.CURRENT] }));
    else if (p === "{pages}") children.push(new TextRun({ children: [PageNumber.TOTAL_PAGES] }));
    else if (p) children.push(new TextRun(p));
  }
  return new Paragraph({ alignment: AlignmentType.CENTER, children: children as TextRun[] });
}

function styleRun(s: StyleDef) {
  return { font: s.fontFamily.split(",")[0]!.replace(/['"]/g, "").trim(), size: Math.round(s.fontSize * 2), bold: s.bold, italics: s.italic, color: hex(s.color) };
}
function styleParagraph(s: StyleDef) {
  return { spacing: { before: Math.round(s.spaceBefore * 20), after: Math.round(s.spaceAfter * 20), line: Math.round(s.lineHeight * 240) } };
}

/** A .docx file of a document, with suggestions as tracked changes. */
export async function toDocx(doc: PDocFile): Promise<Uint8Array> {
  const p = doc.page;
  const paper = PAPER[p.size];
  const landscape = p.orientation === "landscape";
  const ctx: Ctx = { doc, listInstance: 0, revision: 1, maxImageWidth: Math.round((((landscape ? paper.height : paper.width) - p.margins.left - p.margins.right) * 96)), noteIds: new Map(), anchors: new Map() };
  const taken = new Set<string>();
  for (const a of anchorsOfJSON(doc.content)) if (!ctx.anchors.has(a.id)) ctx.anchors.set(a.id, wordBookmarkName(a, taken));
  const footnotes: Record<string, { children: Paragraph[] }> = {};
  const endnotes: Record<string, { children: Paragraph[] }> = {};
  const notes = notesListOf(doc.content);
  const count = { footnote: 0, endnote: 0 };
  for (const n of notes) ctx.noteIds.set(n.id, { kind: n.kind, num: ++count[n.kind] });
  for (const n of notes) {
    const paras = blocks(n.content, ctx).filter((b): b is Paragraph => b instanceof Paragraph);
    (n.kind === "endnote" ? endnotes : footnotes)[String(ctx.noteIds.get(n.id)!.num)] = { children: paras.length ? paras : [new Paragraph({ children: [] })] };
  }
  const children = blocks(doc.content.content, ctx);
  const s = doc.styles;
  const levels = (format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (l: number) => string) =>
    Array.from({ length: 9 }, (_, level) => ({ level, format, text: text(level), alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } }));
  const document = new Document({
    creator: "P-Doc",
    title: doc.title,
    features: { trackRevisions: false },
    ...(count.footnote ? { footnotes } : {}),
    ...(count.endnote ? { endnotes } : {}),
    styles: {
      default: { document: { run: styleRun(s.normal), paragraph: styleParagraph(s.normal) } },
      paragraphStyles: [
        ...(["heading1", "heading2", "heading3", "heading4"] as const).map((k, i) => ({ id: `Heading${i + 1}`, name: `Heading ${i + 1}`, basedOn: "Normal", next: "Normal", quickFormat: true, run: styleRun(s[k]), paragraph: styleParagraph(s[k]) })),
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", quickFormat: true, run: styleRun(s.title), paragraph: styleParagraph(s.title) },
        { id: "Subtitle", name: "Subtitle", basedOn: "Normal", next: "Normal", quickFormat: true, run: styleRun(s.subtitle), paragraph: styleParagraph(s.subtitle) },
        { id: "Code", name: "Code", basedOn: "Normal", run: { font: "Consolas", size: 20 }, paragraph: { spacing: { after: 0 } } },
      ],
    },
    numbering: {
      config: [
        { reference: "pd-bullets", levels: levels(LevelFormat.BULLET, (l) => ["•", "◦", "▪"][l % 3]!) },
        { reference: "pd-numbers", levels: levels(LevelFormat.DECIMAL, (l) => `%${l + 1}.`) },
      ],
    },
    sections: [
      {
        properties: {
          titlePage: p.differentFirstPage,
          page: {
            size: { width: Math.round(paper.width * TWIP), height: Math.round(paper.height * TWIP), orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
            margin: { top: Math.round(p.margins.top * TWIP), bottom: Math.round(p.margins.bottom * TWIP), left: Math.round(p.margins.left * TWIP), right: Math.round(p.margins.right * TWIP) },
          },
        },
        headers: {
          ...(p.header ? { default: new Header({ children: [hfParagraph(p.header)] }) } : {}),
          ...(p.differentFirstPage ? { first: new Header({ children: [hfParagraph(p.firstHeader)] }) } : {}),
        },
        footers: {
          ...(p.footer ? { default: new Footer({ children: [hfParagraph(p.footer)] }) } : {}),
          ...(p.differentFirstPage ? { first: new Footer({ children: [hfParagraph(p.firstFooter)] }) } : {}),
        },
        children: children.length ? children : [new Paragraph({ children: [] })],
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(document));
}

export interface DocxImport {
  content: JSONContent;
  /** Parts left out, for the "Imported. Some parts … were left out." notice. */
  warnings: string[];
}

/** Content from a .docx file. */
export async function fromDocx(data: Uint8Array): Promise<DocxImport> {
  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(data) },
    {
      styleMap: ["p[style-name='Title'] => p.pd-style-title:fresh", "p[style-name='Subtitle'] => p.pd-style-subtitle:fresh", "p[style-name='Quote'] => blockquote > p:fresh", "r[style-name='Code'] => code"],
    },
  );
  const warnings = result.messages.filter((m) => m.type === "warning").map((m) => m.message);
  // Images are blocks in P-Doc; Word wraps each in a paragraph, which would leave an empty one behind.
  const html = wordBookmarks(wordNotes(result.value.replace(/<p>((?:<img [^>]*\/?>)+)<\/p>/g, "$1")));
  return { content: orderNotes(fromHTML(html)), warnings };
}

/**
 * Word's footnotes and endnotes as P-Doc notes. Mammoth writes each reference as a linked "[n]" and the notes as
 * one list at the end, each with a link back ("↑").
 */
export function wordNotes(html: string): string {
  const first = html.search(/<li id="(?:footnote|endnote)-\d+">/);
  const listStart = first < 0 ? -1 : html.lastIndexOf("<ol>", first);
  let body = html;
  let notes = "";
  if (listStart >= 0 && html.trimEnd().endsWith("</ol>")) {
    body = html.slice(0, listStart);
    const items = html.slice(listStart + 4, html.trimEnd().length - 5).split(/(?=<li id="(?:footnote|endnote)-\d+">)/);
    for (const item of items) {
      const m = /^<li id="(footnote|endnote)-(\d+)">([\s\S]*)<\/li>\s*$/.exec(item);
      if (!m) continue;
      const text = m[3]!.replace(/\s*<a href="#(?:footnote|endnote)-ref-\d+">↑<\/a>/g, "");
      notes += `<div data-type="note" data-id="w${m[1]![0]}${m[2]}" data-kind="${m[1]}">${/^\s*<p[\s>]/.test(text) ? text : `<p>${text}</p>`}</div>`;
    }
  }
  body = body.replace(/<sup><a href="#(footnote|endnote)-(\d+)" id="(?:footnote|endnote)-ref-\d+">[^<]*<\/a><\/sup>/g, (_, kind: string, n: string) => `<sup data-type="note-ref" data-id="w${kind[0]}${n}" data-kind="${kind}"></sup>`);
  return notes ? `${body}<section data-type="notes">${notes}</section>` : body;
}

/**
 * Word's bookmarks (mammoth writes each as an empty anchor): one at the start of a heading names the heading,
 * Word's own hidden ones ("_Toc…", "_GoBack") are dropped unless a link goes to them, and the rest become bookmarks.
 */
export function wordBookmarks(html: string): string {
  const linked = new Set([...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]!));
  html = html.replace(/<h([1-6])>((?:<a id="[^"]+"><\/a>)+)/g, (_, level: string, anchors: string) => {
    const ids = [...anchors.matchAll(/id="([^"]+)"/g)].map((m) => m[1]!);
    const id = ids.find((i) => linked.has(i)) ?? ids.find((i) => !i.startsWith("_")) ?? ids[0]!;
    return `<h${level} id="${id}">`;
  });
  return html.replace(/<a id="([^"]+)"><\/a>/g, (_, id: string) => (id.startsWith("_") && !linked.has(id) ? "" : `<span data-type="bookmark" id="${id}" data-name="${id.replace(/_/g, " ").trim()}"></span>`));
}

/** Notes in the order P-Doc keeps them: footnotes, then endnotes, each in the order of their references. */
function orderNotes(content: JSONContent): JSONContent {
  const blocks = content.content ?? [];
  const box = blocks.find((b) => b.type === "notes");
  if (!box) return content;
  const order: string[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === "noteRef" && n.attrs?.id) order.push(String(n.attrs.id));
    n.content?.forEach(walk);
  };
  blocks.filter((b) => b !== box).forEach(walk);
  const rank = (n: JSONContent) => (n.attrs?.kind === "endnote" ? 1e6 : 0) + (order.indexOf(String(n.attrs?.id)) + 1 || 5e5);
  const notes = (box.content ?? []).filter((n) => order.includes(String(n.attrs?.id))).sort((a, b) => rank(a) - rank(b));
  const rest = blocks.filter((b) => b !== box);
  return { ...content, content: notes.length ? [...rest, { ...box, content: notes }] : rest };
}
