/** Word (.docx) export and import (U17, U18). Node only: used by the main process and the CLI. */
import type { JSONContent } from "@tiptap/core";
import {
  AlignmentType,
  BorderStyle,
  DeletedTextRun,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  InsertedTextRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type ParagraphChild,
} from "docx";
import mammoth from "mammoth";
import { PAPER, type PDocFile, type StyleDef } from "./format.ts";
import { fromHTML } from "./convert.ts";
import { nodeText } from "./outline.ts";

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

/** Width and height of a PNG, JPEG or GIF. */
export function imageSize(buf: Uint8Array): { width: number; height: number; type: "png" | "jpg" | "gif" | "bmp" } | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) return { width: dv.getUint32(16), height: dv.getUint32(20), type: "png" };
  if (buf.length > 10 && buf[0] === 0x47 && buf[1] === 0x49) return { width: dv.getUint16(6, true), height: dv.getUint16(8, true), type: "gif" };
  if (buf.length > 26 && buf[0] === 0x42 && buf[1] === 0x4d) return { width: dv.getInt32(18, true), height: Math.abs(dv.getInt32(22, true)), type: "bmp" };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1]!;
      const len = dv.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: dv.getUint16(i + 7), height: dv.getUint16(i + 5), type: "jpg" };
      i += 2 + len;
    }
  }
  return null;
}

function dataUrlBytes(src: string): Uint8Array | null {
  const m = /^data:[^;,]+;base64,(.*)$/.exec(src);
  return m ? Uint8Array.from(Buffer.from(m[1]!, "base64")) : null;
}

interface Ctx {
  doc: PDocFile;
  listInstance: number;
  revision: number;
  maxImageWidth: number;
}

function runs(nodes: JSONContent[] | undefined, ctx: Ctx, extra: { font?: string } = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      out.push(new TextRun({ text: "", break: 1 }));
      continue;
    }
    if (n.type === "image") {
      const img = imageRun(n, ctx);
      if (img) out.push(img);
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
    if (link && /^(https?:|mailto:)/i.test(String(link.attrs?.href ?? ""))) out.push(new ExternalHyperlink({ link: String(link.attrs!.href), children: [run] }));
    else out.push(run);
  }
  return out;
}

function imageRun(n: JSONContent, ctx: Ctx): ImageRun | null {
  const bytes = dataUrlBytes(String(n.attrs?.src ?? ""));
  if (!bytes) return null;
  const size = imageSize(bytes);
  if (!size) return null;
  const scale = Math.min(1, ctx.maxImageWidth / Math.max(1, size.width));
  return new ImageRun({ type: size.type, data: bytes, transformation: { width: Math.round(size.width * scale), height: Math.round(size.height * scale) }, altText: { name: "image", title: String(n.attrs?.alt ?? ""), description: String(n.attrs?.alt ?? "") } });
}

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };
const HEADING = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

function paraOptions(n: JSONContent): Partial<IParagraphOptions> {
  const a = n.attrs ?? {};
  const o: Record<string, unknown> = {};
  if (a.textAlign && ALIGN[a.textAlign]) o.alignment = ALIGN[a.textAlign];
  if (a.indent) o.indent = { left: Math.round(Number(a.indent) * 0.5 * TWIP) };
  const spacing: Record<string, number> = {};
  if (a.lineHeight) spacing.line = Math.round(Number(a.lineHeight) * 240);
  if (a.spaceBefore != null) spacing.before = Math.round(Number(a.spaceBefore) * 20);
  if (a.spaceAfter != null) spacing.after = Math.round(Number(a.spaceAfter) * 20);
  if (Object.keys(spacing).length) o.spacing = spacing;
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
      case "heading":
        out.push(new Paragraph({ ...paraOptions(n), heading: HEADING[Number(n.attrs?.level ?? 1) - 1], children: runs(n.content, ctx) }));
        break;
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
      case "image": {
        const img = imageRun(n, ctx);
        if (img) out.push(new Paragraph({ children: [img] }));
        break;
      }
      case "tableOfContents": {
        out.push(new Paragraph({ style: "TOCHeading", children: [new TextRun({ text: "Contents", bold: true })] }));
        for (const e of (n.attrs?.entries ?? []) as { level: number; text: string }[]) out.push(new Paragraph({ indent: { left: (e.level - 1) * 360 }, children: [new TextRun(e.text)] }));
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
  const ctx: Ctx = { doc, listInstance: 0, revision: 1, maxImageWidth: Math.round((((landscape ? paper.height : paper.width) - p.margins.left - p.margins.right) * 96)) };
  const children = blocks(doc.content.content, ctx);
  const s = doc.styles;
  const levels = (format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (l: number) => string) =>
    Array.from({ length: 9 }, (_, level) => ({ level, format, text: text(level), alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } }));
  const document = new Document({
    creator: "P-Doc",
    title: doc.title,
    features: { trackRevisions: false },
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
  const html = result.value.replace(/<p>((?:<img [^>]*\/?>)+)<\/p>/g, "$1");
  return { content: fromHTML(html), warnings };
}
