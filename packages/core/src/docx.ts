/** Word (.docx) export and import (U17, U18). Node only: used by the main process and the CLI. */
import type { JSONContent } from "@tiptap/core";
import {
  AlignmentType,
  Bookmark as DocxBookmark,
  BorderStyle,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
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
  ColumnBreak as DocxColumnBreak,
  Math as DocxMath,
  NumberFormat,
  PageNumber,
  SectionType,
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
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
  type ICommentOptions,
  type IParagraphOptions,
  type ParagraphChild,
} from "docx";
import JSZip from "jszip";
import mammoth from "mammoth";
import { applyReview, prepareReview, readWordComments, stripMarkers } from "./docx-review.ts";
import type { CommentThread } from "./format.ts";
import { latexToMath } from "docx/math";
import { PAPER, type HfAlign, type HfTexts, type NumFormat, type PDocFile, type StyleDef } from "./format.ts";
import { sectionsOf, type SectionStart } from "./sections.ts";
import { fromHTML } from "./convert.ts";
import { nodeText } from "./outline.ts";
import { notesListOf } from "./notes.ts";
import { anchorsOfJSON, wordBookmarkName } from "./refs.ts";
import { BORDER_SIDES, cleanLayout } from "./paragraph.ts";
import { cleanCrop, dataImageParts, imageInfo } from "./image.ts";
import { followingStyle, isStyleKey, styleKeys, styleLabel, wordStyleId } from "./styles.ts";
import { cleanListFormat, cleanStart, defaultListFormat, wordLevel, type ListFormat, type ListKind } from "./lists.ts";

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
  /** The Word numbering each list format and start needs, by reference. */
  lists: Map<string, { format: ListFormat; start: number }>;
  revision: number;
  maxImageWidth: number;
  /** Word's id of each note (footnotes and endnotes count separately). */
  noteIds: Map<string, { kind: "footnote" | "endnote"; num: number }>;
  /** Word's bookmark name of each heading and bookmark, by id. */
  anchors: Map<string, string>;
  /** Word's comment ids that start before, and end after, each text node (U67). */
  commentStarts: Map<JSONContent, number[]>;
  commentEnds: Map<JSONContent, number[]>;
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
    if (n.type === "mathInline") {
      out.push(equation(String(n.attrs?.latex ?? "")));
      continue;
    }
    if (n.type === "noteRef") {
      const note = ctx.noteIds.get(String(n.attrs?.id ?? ""));
      if (note) out.push(note.kind === "endnote" ? new EndnoteReferenceRun(note.num) : new FootnoteReferenceRun(note.num));
      continue;
    }
    if (n.type !== "text") continue;
    const marks = (n.marks ?? []) as Mark[];
    const ins = marks.find((m) => m.type === "insertion");
    const del = marks.find((m) => m.type === "deletion");
    const change = !ins && !del ? marks.find((m) => m.type === "formatChange") : undefined;
    const link = marks.find((m) => m.type === "link");
    const opts = {
      text: n.text ?? "",
      ...runFormat(marks, extra),
      style: link ? "Hyperlink" : undefined,
      // A formatting suggestion is Word's tracked formatting change, holding the formatting the text had (U67).
      ...(change ? { revision: { id: ctx.revision++, author: String(change.attrs?.author || "P-Doc"), date: String(change.attrs?.time || new Date().toISOString()), ...runFormat((change.attrs?.old ?? []) as Mark[], extra), style: link ? "Hyperlink" : undefined } } : {}),
    };
    let run: ParagraphChild;
    if (ins) run = new InsertedTextRun({ ...opts, id: ctx.revision++, author: String(ins.attrs?.author || "P-Doc"), date: String(ins.attrs?.time || new Date().toISOString()) });
    else if (del) run = new DeletedTextRun({ ...opts, id: ctx.revision++, author: String(del.attrs?.author || "P-Doc"), date: String(del.attrs?.time || new Date().toISOString()) });
    else run = new TextRun(opts);
    const href = String(link?.attrs?.href ?? "");
    const anchor = href.startsWith("#") ? ctx.anchors.get(href.slice(1)) : undefined;
    for (const id of ctx.commentStarts.get(n) ?? []) out.push(new CommentRangeStart(id));
    if (anchor) out.push(new InternalHyperlink({ anchor, children: [run] }));
    else if (link && /^(https?:|mailto:)/i.test(href)) out.push(new ExternalHyperlink({ link: href, children: [run] }));
    else out.push(run);
    for (const id of ctx.commentEnds.get(n) ?? []) out.push(new CommentRangeEnd(id), new TextRun({ children: [new CommentReference(id)] }));
  }
  return out;
}

/**
 * Word's comments of a document (U67): each thread on the text its comment mark covers, with its replies threaded
 * under it and its resolved state. A thread whose text is gone has nowhere to sit in Word, so it stays out.
 */
function wordComments(doc: PDocFile, ctx: Ctx): ICommentOptions[] {
  const first = new Map<string, JSONContent>();
  const last = new Map<string, JSONContent>();
  const walk = (n: JSONContent) => {
    if (n.type === "text") {
      for (const m of n.marks ?? []) {
        if (m.type !== "comment") continue;
        const id = String(m.attrs?.id ?? "");
        if (!first.has(id)) first.set(id, n);
        last.set(id, n);
      }
    }
    for (const c of n.content ?? []) walk(c);
  };
  walk(doc.content);
  const out: ICommentOptions[] = [];
  const body = (s: string) => s.split("\n").map((line) => new Paragraph({ children: [new TextRun(line)] }));
  const initials = (a: string) => a.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("").slice(0, 3) || "P";
  const at = (iso: string) => (Number.isNaN(Date.parse(iso)) ? new Date() : new Date(iso));
  for (const t of doc.comments ?? []) {
    const start = first.get(t.id);
    const end = last.get(t.id);
    if (!start || !end) continue;
    const root = out.length;
    const ids = [root, ...t.replies.map((_, i) => root + 1 + i)];
    out.push({ id: root, author: t.author || "P-Doc", initials: initials(t.author), date: at(t.created), children: body(t.body), resolved: t.resolved || undefined });
    t.replies.forEach((r, i) => out.push({ id: root + 1 + i, author: r.author || "P-Doc", initials: initials(r.author), date: at(r.created), children: body(r.body), parentId: root, resolved: t.resolved || undefined }));
    ctx.commentStarts.set(start, [...(ctx.commentStarts.get(start) ?? []), ...ids]);
    ctx.commentEnds.set(end, [...(ctx.commentEnds.get(end) ?? []), ...ids]);
  }
  return out;
}

/** A run's formatting as Word writes it, from its marks. */
function runFormat(marks: Mark[], extra: { font?: string }) {
  const has = (t: string) => marks.some((m) => m.type === t);
  const style = marks.find((m) => m.type === "textStyle")?.attrs ?? {};
  const highlight = marks.find((m) => m.type === "highlight")?.attrs?.color as string | undefined;
  return {
    bold: has("bold") || undefined,
    italics: has("italic") || undefined,
    underline: has("underline") ? {} : undefined,
    strike: has("strike") || undefined,
    superScript: has("superscript") || undefined,
    subScript: has("subscript") || undefined,
    font: (style.fontFamily as string | undefined)?.split(",")[0]?.replace(/['"]/g, "").trim() ?? extra.font,
    size: points(style.fontSize) ? Math.round(points(style.fontSize)! * 2) : undefined,
    color: hex(style.color as string),
    shading: has("highlight") ? { type: ShadingType.CLEAR, fill: hex(highlight) ?? "FFF59D", color: "auto" as const } : undefined,
  };
}

/** A paragraph's style as Word names it: a heading level, Title or Subtitle. */
function paraStyle(n: JSONContent): Partial<IParagraphOptions> {
  if (n.type === "heading") return { heading: HEADING[Number(n.attrs?.level ?? 1) - 1] };
  const ts = n.attrs?.textStyle;
  return isStyleKey(ts) ? { style: wordStyleId(ts) } : {};
}

/** A paragraph's formatting suggestion as Word's tracked paragraph change, holding its old style and layout (U67). */
function paraRevision(n: JSONContent, ctx: Ctx): Partial<IParagraphOptions> {
  const f = n.attrs?.formatChange as { author?: string; time?: string; old?: { type: string; attrs: Record<string, unknown> } } | null | undefined;
  if (!f?.old) return {};
  const old: JSONContent = { type: f.old.type, attrs: f.old.attrs };
  return { revision: { id: ctx.revision++, author: f.author || "P-Doc", date: f.time || new Date().toISOString(), ...paraOptions(old), ...paraStyle(old) } as IParagraphOptions["revision"] };
}

/** An equation as Word's own (A17), which Word edits as one typed into it; LaTeX it can't read stays as text. */
function equation(latex: string): ParagraphChild {
  try {
    return new DocxMath({ children: latexToMath(latex) });
  } catch {
    return new TextRun({ text: latex, font: "Cambria Math" });
  }
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
const HEADING = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

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
        out.push(
          new Paragraph({
            ...paraStyle(n),
            ...paraOptions(n),
            ...(list ? { numbering: { reference: list.ref, level: list.level, instance: list.instance } } : {}),
            ...paraRevision(n, ctx),
            children: runs(n.content, ctx),
          }),
        );
        list = list && { ...list, ref: list.ref };
        break;
      }
      case "heading": {
        const name = ctx.anchors.get(String(n.attrs?.id ?? ""));
        const children = runs(n.content, ctx);
        out.push(new Paragraph({ ...paraOptions(n), heading: HEADING[Number(n.attrs?.level ?? 1) - 1], ...paraRevision(n, ctx), children: name ? [new DocxBookmark({ id: name, children })] : children }));
        break;
      }
      case "blockquote":
        for (const c of blocks(n.content?.map((c) => c.type === "paragraph" && !c.attrs?.textStyle ? { ...c, attrs: { ...c.attrs, textStyle: "quote" } } : c), ctx)) {
          out.push(c);
        }
        break;
      case "codeBlock":
        for (const line of nodeText(n).split("\n")) out.push(new Paragraph({ style: "Code", children: [new TextRun({ text: line })] }));
        break;
      case "horizontalRule":
        out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } }, children: [] }));
        break;
      case "pageBreak":
        out.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case "columnBreak":
        out.push(new Paragraph({ children: [new DocxColumnBreak()] }));
        break;
      case "mathBlock":
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [equation(String(n.attrs?.latex ?? ""))] }));
        break;
      case "sectionBreak":
        // Each section is written as a Word section of its own (see toDocx).
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
        const level = list ? list.level + 1 : 0;
        let ref = "pd-bullets";
        let instance = 0;
        if (n.type !== "taskList") {
          // One Word numbering per format and start; each numbered list counts on its own.
          const kind = n.type as ListKind;
          const format = cleanListFormat(kind, n.attrs?.listFormat) ?? defaultListFormat(kind, level);
          const start = kind === "orderedList" ? cleanStart(n.attrs?.start) : 1;
          ref = `pd-list-${format}-${start}`;
          ctx.lists.set(ref, { format, start });
          if (kind === "orderedList") instance = ++ctx.listInstance;
        }
        for (const item of n.content ?? []) {
          const [first, ...rest] = item.content ?? [];
          const prefix = n.type === "taskList" ? [new TextRun(item.attrs?.checked ? "☒ " : "☐ ")] : [];
          out.push(new Paragraph({ ...(first ? paraOptions(first) : {}), numbering: { reference: ref, level, instance }, children: [...prefix, ...runs(first?.content, ctx)] }));
          out.push(...blocks(rest, ctx, { ref, level, instance }));
        }
        break;
      }
      case "table": {
        // Widths dragged or distributed (px at 96 per inch) go to Word in twips; without them the table fills the line.
        const widths = (n.content?.[0]?.content ?? []).flatMap((c) => {
          const w = c.attrs?.colwidth as number[] | null | undefined;
          return Array.from({ length: Number(c.attrs?.colspan ?? 1) }, (_, i) => w?.[i] ?? 0);
        });
        const fixed = widths.length > 0 && widths.every((w) => w > 0);
        const rows = (n.content ?? []).map(
          (r) =>
            new TableRow({
              tableHeader: (r.content ?? []).every((c) => c.type === "tableHeader") || undefined,
              children: (r.content ?? []).map(
                (c) =>
                  new TableCell({
                    columnSpan: Number(c.attrs?.colspan ?? 1) > 1 ? Number(c.attrs?.colspan) : undefined,
                    rowSpan: Number(c.attrs?.rowspan ?? 1) > 1 ? Number(c.attrs?.rowspan) : undefined,
                    width: fixed && c.attrs?.colwidth ? { size: (c.attrs.colwidth as number[]).reduce((a, b) => a + b, 0) * 15, type: WidthType.DXA } : undefined,
                    shading: c.attrs?.background ? { fill: hex(c.attrs.background as string), type: ShadingType.CLEAR, color: "auto" } : undefined,
                    verticalAlign: c.attrs?.valign === "middle" ? VerticalAlign.CENTER : c.attrs?.valign === "bottom" ? VerticalAlign.BOTTOM : undefined,
                    borders: c.attrs?.borderWidth == null ? undefined : cellBorders(Number(c.attrs.borderWidth), c.attrs.borderColor as string | null),
                    margins: c.attrs?.padding == null ? undefined : (["top", "bottom", "left", "right"] as const).reduce((m, s) => ({ ...m, [s]: Math.round(Number(c.attrs!.padding) * 20) }), {}),
                    children: blocks(c.content, ctx).filter((b): b is Paragraph => b instanceof Paragraph).concat([]) as Paragraph[],
                  }),
              ),
            }),
        );
        if (rows.length)
          out.push(
            fixed
              ? new Table({ rows, columnWidths: widths.map((w) => w * 15), width: { size: widths.reduce((a, b) => a + b, 0) * 15, type: WidthType.DXA } })
              : new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }),
          );
        break;
      }
      default:
        if (n.content) out.push(...blocks(n.content, ctx, list));
    }
  }
  return out;
}

/** A cell's four borders: `w` pt (eighths of a point in Word), none at 0. */
function cellBorders(w: number, colour: string | null) {
  const side = w > 0 ? { style: BorderStyle.SINGLE, size: Math.max(2, Math.round(w * 8)), color: hex(colour ?? "#000000") ?? "000000" } : { style: BorderStyle.NONE, size: 0, color: "auto" };
  return { top: side, bottom: side, left: side, right: side };
}

function hfParagraph(text: string, align: HfAlign): Paragraph {
  const children: (TextRun | string)[] = [];
  const parts = text.split(/(\{page\}|\{pages\})/);
  for (const p of parts) {
    if (p === "{page}") children.push(new TextRun({ children: [PageNumber.CURRENT] }));
    else if (p === "{pages}") children.push(new TextRun({ children: [PageNumber.TOTAL_PAGES] }));
    else if (p) children.push(new TextRun(p));
  }
  return new Paragraph({ alignment: ALIGN[align], children: children as TextRun[] });
}

function styleRun(s: StyleDef) {
  return { font: s.fontFamily.split(",")[0]!.replace(/['"]/g, "").trim(), size: Math.round(s.fontSize * 2), bold: s.bold, italics: s.italic, color: hex(s.color), smallCaps: s.smallCaps };
}
function styleParagraph(s: StyleDef) {
  return { spacing: { before: Math.round(s.spaceBefore * 20), after: Math.round(s.spaceAfter * 20), line: Math.round(s.lineHeight * 240) }, ...(s.indent ? { indent: { left: Math.round(s.indent * 720) } } : {}) };
}

const SECTION_TYPE: Record<SectionStart, (typeof SectionType)[keyof typeof SectionType]> = { next: SectionType.NEXT_PAGE, continuous: SectionType.CONTINUOUS, odd: SectionType.ODD_PAGE, even: SectionType.EVEN_PAGE };
const NUMBER_FORMAT: Record<NumFormat, (typeof NumberFormat)[keyof typeof NumberFormat]> = { "1": NumberFormat.DECIMAL, i: NumberFormat.LOWER_ROMAN, I: NumberFormat.UPPER_ROMAN, a: NumberFormat.LOWER_LETTER, A: NumberFormat.UPPER_LETTER };

/** A .docx file of a document, with suggestions as tracked changes. */
export async function toDocx(doc: PDocFile): Promise<Uint8Array> {
  const pending = [doc.content];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.attrs?.blockChange) throw new Error("Accept or reject whole-block comparison changes before exporting to Word. They stay in the P-Doc document.");
    pending.push(...(node.content ?? []));
  }
  const p = doc.page;
  const paper = PAPER[p.size];
  const landscape = p.orientation === "landscape";
  const ctx: Ctx = { doc, listInstance: 0, lists: new Map(), revision: 1, maxImageWidth: Math.round((((landscape ? paper.height : paper.width) - p.margins.left - p.margins.right) * 96)), noteIds: new Map(), anchors: new Map(), commentStarts: new Map(), commentEnds: new Map() };
  const comments = wordComments(doc, ctx);
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
  // One Word section per section (U55, U57): its own paper, start, numbering, and headers unless linked.
  const sections = sectionsOf(doc.content, p);
  const groups: JSONContent[][] = sections.map(() => []);
  let at = 0;
  for (const n of doc.content.content ?? []) {
    if (n.type === "sectionBreak") at++;
    else groups[at]!.push(n);
  }
  const hfs = (t: HfTexts, which: "header" | "footer") => {
    const make = (s: string) => (which === "header" ? new Header({ children: [hfParagraph(s, p.headerAlign)] }) : new Footer({ children: [hfParagraph(s, p.footerAlign)] }));
    const [d, first, even] = which === "header" ? [t.header, t.firstHeader, t.evenHeader] : [t.footer, t.firstFooter, t.evenFooter];
    return { default: make(d), ...(p.differentFirstPage ? { first: make(first) } : {}), ...(p.differentOddEven ? { even: make(even) } : {}) };
  };
  const anyHf = (t: HfTexts) => !!(t.header || t.footer || (p.differentFirstPage && (t.firstHeader || t.firstFooter)) || (p.differentOddEven && (t.evenHeader || t.evenFooter)));
  const s = doc.styles;
  // Lists are found while writing the body, so it is written before the numbering they need is defined.
  const bodies = groups.map((g) => blocks(g, ctx));
  const levels = (format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (l: number) => string, start = 1) =>
    Array.from({ length: 9 }, (_, level) => ({ level, format, text: text(level), start, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } }));
  const document = new Document({
    creator: "P-Doc",
    title: doc.title,
    features: { trackRevisions: false },
    ...(count.footnote ? { footnotes } : {}),
    ...(count.endnote ? { endnotes } : {}),
    ...(comments.length ? { comments: { children: comments } } : {}),
    styles: {
      default: { document: { run: styleRun(s.normal), paragraph: styleParagraph(s.normal) } },
      paragraphStyles: [
        ...styleKeys(s).map((k) => ({
          id: wordStyleId(k), name: styleLabel(k, s), ...(k === "normal" ? {} : { basedOn: "Normal" }),
          next: wordStyleId(followingStyle(k, s)), quickFormat: true, run: styleRun(s[k]),
          paragraph: { ...styleParagraph(s[k]), ...(k.startsWith("heading") ? { outlineLevel: Number(k.slice(7)) - 1 } : {}) },
        })),
      ],
    },
    numbering: {
      config: [
        { reference: "pd-bullets", levels: levels(LevelFormat.BULLET, (l) => ["•", "◦", "▪"][l % 3]!) },
        ...[...ctx.lists].map(([reference, { format, start }]) => ({
          reference,
          levels: levels(wordLevel(format, 0).format as (typeof LevelFormat)[keyof typeof LevelFormat], (l) => wordLevel(format, l).text, start),
        })),
      ],
    },
    evenAndOddHeaderAndFooters: p.differentOddEven,
    sections: sections.map((sec, k) => {
      const sp = sec.page;
      const sz = PAPER[sp.size];
      const children = bodies[k]!;
      // A section linked to the one before writes no headers of its own: Word carries them on.
      const own = k === 0 ? anyHf(sec.hf) : sec.ownHf;
      return {
        properties: {
          ...(k > 0 ? { type: SECTION_TYPE[sec.start] } : {}),
          titlePage: p.differentFirstPage,
          page: {
            size: { width: Math.round(sz.width * TWIP), height: Math.round(sz.height * TWIP), orientation: sp.orientation === "landscape" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
            margin: { top: Math.round(sp.margins.top * TWIP), bottom: Math.round(sp.margins.bottom * TWIP), left: Math.round(sp.margins.left * TWIP), right: Math.round(sp.margins.right * TWIP) },
            pageNumbers: { formatType: NUMBER_FORMAT[sec.format], ...(sec.numStart != null ? { start: sec.numStart } : {}) },
          },
          ...(sec.columns.count > 1 ? { column: { count: sec.columns.count, space: Math.round(sec.columns.gap * TWIP), equalWidth: true } } : {}),
        },
        ...(own ? { headers: hfs(sec.hf, "header"), footers: hfs(sec.hf, "footer") } : {}),
        children: children.length ? children : [new Paragraph({ children: [] })],
      };
    }),
  });
  return new Uint8Array(await Packer.toBuffer(document));
}

export interface DocxImport {
  content: JSONContent;
  /** Parts left out, for the "Imported. Some parts … were left out." notice. */
  warnings: string[];
  /** Word's comments, and the changes P-Doc keeps as comments (U67). */
  comments: CommentThread[];
  /** How many of those comments are kept changes, for the "*n* changes kept as comments" notice. */
  kept: number;
}

const REVIEW_PARTS = /<w:(?:ins|del|moveTo|moveFrom|rPrChange|pPrChange|trPrChange|tcPrChange|tblPrChange|tblGridChange|commentRangeStart)\b/;

/** Content from a .docx file, with Word's tracked changes as suggestions and its comments as comments (U67). */
export async function fromDocx(data: Uint8Array): Promise<DocxImport> {
  let buffer: Buffer = Buffer.from(data);
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file("word/document.xml")?.async("string");
  const prep = docXml && REVIEW_PARTS.test(docXml) ? prepareReview(docXml) : null;
  if (prep) {
    zip.file("word/document.xml", prep.xml);
    buffer = await zip.generateAsync({ type: "nodebuffer" });
  }
  const word = prep ? readWordComments((await zip.file("word/comments.xml")?.async("string")) ?? null, (await zip.file("word/commentsExtended.xml")?.async("string")) ?? null) : [];
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: ["p[style-name='Title'] => p.pd-style-title:fresh", "p[style-name='Subtitle'] => p.pd-style-subtitle:fresh", "p[style-name='Quote'] => blockquote > p:fresh", "r[style-name='Code'] => code"],
    },
  );
  const warnings = result.messages.filter((m) => m.type === "warning").map((m) => m.message);
  // Images are blocks in P-Doc; Word wraps each in a paragraph, which would leave an empty one behind.
  const html = wordBookmarks(wordNotes(result.value.replace(/<p>((?:<img [^>]*\/?>)+)<\/p>/g, "$1")));
  const content = orderNotes(fromHTML(html));
  if (!prep) return { content, warnings, comments: [], kept: 0 };
  const review = applyReview(content, prep, word);
  return { content: JSON.parse(stripMarkers(JSON.stringify(review.content))) as JSONContent, warnings, comments: review.comments, kept: prep.kept.length };
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
