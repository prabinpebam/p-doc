/**
 * The document schema shared by the editor (renderer), conversions (main) and the CLI: one list of
 * TipTap extensions, so every surface reads and writes the same content.
 */
import { ColumnBreak, SectionBreak } from "./sections.ts";
import { MathBlock, MathInline } from "./equations.ts";
import { Extension, Mark, Node, mergeAttributes, getSchema, type AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { PImage } from "./image.ts";
import { TableKit } from "@tiptap/extension-table";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { cleanLayout, layoutCss, lineHeightCss, Tab } from "./paragraph.ts";
import { Note, NoteRef, Notes, NotesDoc } from "./notes.ts";
import { Bookmark } from "./refs.ts";
import { cleanListFormat, listStyleType, type ListFormat } from "./lists.ts";

export const TEXTBLOCKS = ["paragraph", "heading"] as const;

const VALIGN = ["middle", "bottom"];
/** A table cell's shading, vertical alignment, border (pt, 0 for none, and colour) and padding (pt) (U60); widths are the table's own `colwidth`. */
export const CellFormat = Extension.create({
  name: "cellFormat",
  addGlobalAttributes() {
    return [
      {
        types: ["tableCell", "tableHeader"],
        attributes: {
          background: {
            default: null,
            parseHTML: (el: HTMLElement) => {
              const c = el.style.backgroundColor || el.getAttribute("data-background");
              return c ? colourHex(c) : null;
            },
            renderHTML: (a: Record<string, unknown>) => (a.background ? { style: `background-color: ${a.background}` } : {}),
          },
          valign: {
            default: null,
            parseHTML: (el: HTMLElement) => {
              const v = el.style.verticalAlign || el.getAttribute("valign") || "";
              return VALIGN.includes(v) ? v : null;
            },
            renderHTML: (a: Record<string, unknown>) => (a.valign ? { style: `vertical-align: ${a.valign}` } : {}),
          },
          borderWidth: {
            default: null,
            parseHTML: (el: HTMLElement) => num(el.getAttribute("data-border-width")),
            renderHTML: (a: Record<string, unknown>) =>
              a.borderWidth == null ? {} : { "data-border-width": a.borderWidth, style: a.borderWidth === 0 ? "border: none" : `border: ${a.borderWidth}pt solid ${a.borderColor ?? "#000000"}` },
          },
          borderColor: {
            default: null,
            parseHTML: (el: HTMLElement) => colourHex(el.getAttribute("data-border-color") ?? ""),
            renderHTML: (a: Record<string, unknown>) => (a.borderColor ? { "data-border-color": a.borderColor } : {}),
          },
          padding: {
            default: null,
            parseHTML: (el: HTMLElement) => num(el.getAttribute("data-padding")),
            renderHTML: (a: Record<string, unknown>) => (a.padding == null ? {} : { "data-padding": a.padding, style: `padding: ${a.padding}pt` }),
          },
        },
      },
    ];
  },
});

/** Node types that can be suggested for adding or removing whole (Compare documents, U66). */
export const BLOCK_CHANGE_TYPES = [
  "paragraph",
  "heading",
  "codeBlock",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "table",
  "tableRow",
  "horizontalRule",
  "image",
  "mathBlock",
  "pageBreak",
  "sectionBreak",
  "columnBreak",
  "tableOfContents",
  "note",
  "notes",
] as const;

/** Suggestion {kind: "insertion" | "deletion", id, author, time}: this whole block was added or removed. */
export const BlockChangeAttr = Extension.create({
  name: "blockChange",
  addGlobalAttributes() {
    return [
      {
        types: [...BLOCK_CHANGE_TYPES],
        attributes: {
          blockChange: {
            default: null,
            parseHTML: (el: HTMLElement) => jsonAttr(el.getAttribute("data-block-change")),
            renderHTML: (a: Record<string, unknown>) => {
              const b = a.blockChange as { kind?: string } | null;
              return b?.kind ? { "data-block-change": JSON.stringify(b), class: `pd-block-${b.kind === "deletion" ? "deletion" : "insertion"}` } : {};
            },
          },
        },
      },
    ];
  },
});

const num = (v: string | null) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** `rgb(…)` (how a browser reports a colour) or `#rgb` as `#rrggbb`. */
function colourHex(c: string): string | null {
  const rgb = c.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) return "#" + rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  const h = c.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!h) return null;
  const v = h[1]!.length === 3 ? [...h[1]!].map((x) => x + x).join("") : h[1]!;
  return "#" + v.toLowerCase();
}

/** A list's number format or bullet (U43); none means the level's default (1, a, i / •, ◦, ▪). */
export const ListFormatAttr = Extension.create({
  name: "listFormatAttr",
  addGlobalAttributes() {
    const html: Record<string, ListFormat> = { "1": "decimal", a: "lower-alpha", A: "upper-alpha", i: "lower-roman", I: "upper-roman" };
    return ["orderedList", "bulletList"].map((kind) => ({
      types: [kind],
      attributes: {
        listFormat: {
          default: null,
          parseHTML: (el: HTMLElement) => cleanListFormat(kind, el.getAttribute("data-format") ?? (kind === "orderedList" ? html[el.getAttribute("type") ?? ""] : null)),
          renderHTML: (a: Record<string, unknown>) => {
            const f = cleanListFormat(kind, a.listFormat);
            return f ? { "data-format": f, style: `list-style-type: ${listStyleType(f)}` } : {};
          },
        },
      },
    }));
  },
});

/** Paragraph-level formatting and identity carried by paragraphs and headings. */
export const BlockFormat = Extension.create({
  name: "blockFormat",
  addGlobalAttributes() {
    return [
      {
        types: [...TEXTBLOCKS],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-line-height") || null,
            renderHTML: (a) => (a.lineHeight ? { "data-line-height": a.lineHeight, style: lineHeightCss(a.lineHeight, cleanLayout(a.layout)) } : {}),
          },
          spaceBefore: {
            default: null,
            parseHTML: (el) => numberAttr(el.getAttribute("data-space-before")),
            renderHTML: (a) => (a.spaceBefore != null ? { "data-space-before": a.spaceBefore, style: `--pd-sb: ${a.spaceBefore}pt` } : {}),
          },
          spaceAfter: {
            default: null,
            parseHTML: (el) => numberAttr(el.getAttribute("data-space-after")),
            renderHTML: (a) => (a.spaceAfter != null ? { "data-space-after": a.spaceAfter, style: `margin-bottom: ${a.spaceAfter}pt` } : {}),
          },
          indent: {
            default: 0,
            parseHTML: (el) => numberAttr(el.getAttribute("data-indent")) ?? 0,
            renderHTML: (a) => (a.indent ? { "data-indent": a.indent, style: `margin-inline-start: ${a.indent * 0.5}in` } : {}),
          },
          /** Right and first-line indents, exact spacing, page-break control, borders, shading, direction, tabs (see paragraph.ts). */
          layout: {
            default: null,
            parseHTML: (el) => cleanLayout(jsonAttr(el.getAttribute("data-layout"))),
            renderHTML: (a) => {
              const l = cleanLayout(a.layout);
              if (!l) return {};
              const css = layoutCss(l);
              return { "data-layout": JSON.stringify(l), ...(css ? { style: css } : {}), ...(l.dir ? { dir: l.dir } : {}) };
            },
          },
          /** A paragraph style other than Normal or a heading: "title" or "subtitle". */
          textStyle: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-style") || /\bpd-style-(title|subtitle)\b/.exec(el.className)?.[1] || null,
            renderHTML: (a) => (a.textStyle ? { "data-style": a.textStyle, class: `pd-style-${a.textStyle}` } : {}),
          },
          /** Suggestion {id, author, time}: the boundary before this block was inserted (rejecting joins it to the previous block). */
          split: {
            default: null,
            parseHTML: (el) => jsonAttr(el.getAttribute("data-split")),
            renderHTML: (a) => (a.split ? { "data-split": JSON.stringify(a.split), class: "pd-split" } : {}),
          },
          /** Suggestion {id, author, time}: the boundary before this block was deleted (accepting joins it to the previous block). */
          join: {
            default: null,
            parseHTML: (el) => jsonAttr(el.getAttribute("data-join")),
            renderHTML: (a) => (a.join ? { "data-join": JSON.stringify(a.join), class: "pd-join" } : {}),
          },
          /** Suggestion {id, author, time, old: {type, attrs}}: this block's style or paragraph formatting was changed (rejecting puts `old` back, U63). */
          formatChange: {
            default: null,
            parseHTML: (el) => jsonAttr(el.getAttribute("data-format-change")),
            renderHTML: (a) => (a.formatChange ? { "data-format-change": JSON.stringify(a.formatChange), class: "pd-format-block" } : {}),
          },
        },
      },
      {
        types: ["heading"],
        attributes: {
          id: {
            default: null,
            parseHTML: (el) => el.getAttribute("id") || null,
            renderHTML: (a) => (a.id ? { id: a.id } : {}),
          },
        },
      },
    ];
  },
});

function jsonAttr(v: string | null): unknown {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function numberAttr(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const suggestionAttrs = (kind: string) => ({
  id: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute("data-id"), renderHTML: (a: Record<string, unknown>) => ({ "data-id": a.id }) },
  author: { default: "", parseHTML: (el: HTMLElement) => el.getAttribute("data-author") ?? "", renderHTML: (a: Record<string, unknown>) => ({ "data-author": a.author }) },
  time: { default: "", parseHTML: (el: HTMLElement) => el.getAttribute("data-time") ?? "", renderHTML: (a: Record<string, unknown>) => ({ "data-time": a.time, class: `pd-${kind}` }) },
});

/** Suggested text to add. */
export const Insertion = Mark.create({
  name: "insertion",
  inclusive: false,
  excludes: "deletion",
  addAttributes: () => suggestionAttrs("insertion"),
  parseHTML: () => [{ tag: "ins" }],
  renderHTML: ({ HTMLAttributes }) => ["ins", HTMLAttributes, 0],
});

/** Suggested text to remove: kept in the document until accepted. */
export const Deletion = Mark.create({
  name: "deletion",
  inclusive: false,
  excludes: "insertion",
  addAttributes: () => suggestionAttrs("deletion"),
  parseHTML: () => [{ tag: "del" }],
  renderHTML: ({ HTMLAttributes }) => ["del", HTMLAttributes, 0],
});

/** Suggested formatting (U63): the text has its new formatting; `old` holds the formatting marks it had, which rejecting puts back. */
export const FormatChange = Mark.create({
  name: "formatChange",
  inclusive: false,
  addAttributes: () => ({
    ...suggestionAttrs("format"),
    old: {
      default: [],
      parseHTML: (el: HTMLElement) => (jsonAttr(el.getAttribute("data-old")) as unknown[] | null) ?? [],
      renderHTML: (a: Record<string, unknown>) => ({ "data-old": JSON.stringify(a.old ?? []) }),
    },
  }),
  parseHTML: () => [{ tag: "span[data-format-change]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { "data-format-change": "" }), 0],
});

/** The anchor of a comment thread; several threads may overlap. */
export const CommentMark = Mark.create({
  name: "comment",
  inclusive: false,
  excludes: "",
  addAttributes: () => ({
    id: { default: null, parseHTML: (el) => el.getAttribute("data-comment"), renderHTML: (a) => ({ "data-comment": a.id }) },
  }),
  parseHTML: () => [{ tag: "span[data-comment]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { class: "pd-comment" }), 0],
});

/** A manual page break. */
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-type="page-break"]' }],
  renderHTML: () => ["div", { "data-type": "page-break", class: "pd-page-break" }],
});

export interface TocEntry {
  id: string;
  level: number;
  text: string;
}

/**
 * A table of contents; its entries are kept current by the TOC plugin (see toc.ts). Contents options (U54):
 * `levels` 1–6 deep, and `show` page numbers (with dotted leaders, in Pages) or links only.
 */
export const TableOfContents = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes: () => ({
    entries: {
      default: [],
      parseHTML: (el) => {
        try {
          return JSON.parse(el.getAttribute("data-entries") ?? "[]");
        } catch {
          return [];
        }
      },
      renderHTML: (a) => ({ "data-entries": JSON.stringify(a.entries ?? []) }),
    },
    levels: {
      default: 3,
      parseHTML: (el) => Math.min(6, Math.max(1, Number(el.getAttribute("data-levels")) || 3)),
      renderHTML: (a) => ({ "data-levels": a.levels }),
    },
    show: {
      default: "pages",
      parseHTML: (el) => (el.getAttribute("data-show") === "links" ? "links" : "pages"),
      renderHTML: (a) => ({ "data-show": a.show }),
    },
  }),
  parseHTML: () => [{ tag: 'nav[data-type="toc"]' }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const entries = (node.attrs.entries ?? []) as TocEntry[];
    const items = entries.map((e) => ["li", { class: `pd-toc-l${e.level}` }, ["a", { href: `#${e.id}` }, e.text || " "]]);
    return ["nav", mergeAttributes(HTMLAttributes, { "data-type": "toc", class: "pd-toc" }), ["p", { class: "pd-toc-title" }, "Contents"], ["ul", {}, ...items]] as never;
  },
});

export interface SchemaOptions {
  /** Extra extensions for the live editor (placeholder, plugins). */
  extra?: AnyExtension[];
  /** The URL an image's stored `src` is drawn from (the window maps asset paths to its scheme). */
  resolveImage?: (src: string) => string;
  /** The image node to use instead of the plain one (the window's adds handles and the crop frame). */
  image?: AnyExtension;
  /** The code block to use instead of the plain one (the window's highlights code and picks its language). */
  codeBlock?: AnyExtension;
}

/** The extensions that define P-Doc's content. */
export function extensions(options: SchemaOptions = {}): AnyExtension[] {
  return [
    NotesDoc,
    StarterKit.configure({
      document: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: null } },
      trailingNode: false,
      ...(options.codeBlock ? { codeBlock: false as const } : {}),
    }),
    ...(options.codeBlock ? [options.codeBlock] : []),
    TextStyleKit.configure({ lineHeight: false }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: [...TEXTBLOCKS] }),
    Subscript,
    Superscript,
    Tab,
    options.image ?? (options.resolveImage ? PImage.configure({ resolve: options.resolveImage }) : PImage),
    TableKit.configure({ table: { resizable: true, cellMinWidth: 32 } }),
    CellFormat,
    TaskList,
    TaskItem.configure({ nested: true }),
    BlockFormat,
    ListFormatAttr,
    BlockChangeAttr,
    Insertion,
    Deletion,
    FormatChange,
    CommentMark,
    PageBreak,
    SectionBreak,
    ColumnBreak,
    TableOfContents,
    NoteRef,
    Note,
    Notes,
    Bookmark,
    MathInline,
    MathBlock,
    ...(options.extra ?? []),
  ];
}

let cached: ReturnType<typeof getSchema> | null = null;
/** The ProseMirror schema of P-Doc content. */
export function schema() {
  cached ??= getSchema(extensions());
  return cached;
}
