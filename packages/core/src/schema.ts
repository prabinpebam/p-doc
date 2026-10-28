/**
 * The document schema shared by the editor (renderer), conversions (main) and the CLI: one list of
 * TipTap extensions, so every surface reads and writes the same content.
 */
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

export const TEXTBLOCKS = ["paragraph", "heading"] as const;

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

/** A table of contents; its entries are kept current by the TOC plugin (see toc.ts). */
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
}

/** The extensions that define P-Doc's content. */
export function extensions(options: SchemaOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: null } },
      trailingNode: false,
    }),
    TextStyleKit.configure({ lineHeight: false }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: [...TEXTBLOCKS] }),
    Subscript,
    Superscript,
    Tab,
    options.image ?? (options.resolveImage ? PImage.configure({ resolve: options.resolveImage }) : PImage),
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    BlockFormat,
    Insertion,
    Deletion,
    CommentMark,
    PageBreak,
    TableOfContents,
    ...(options.extra ?? []),
  ];
}

let cached: ReturnType<typeof getSchema> | null = null;
/** The ProseMirror schema of P-Doc content. */
export function schema() {
  cached ??= getSchema(extensions());
  return cached;
}
