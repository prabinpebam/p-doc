/**
 * The document as print and PDF see it (U16, A1): in Pages mode each sheet on screen becomes a page of
 * the same size with the same blocks, header and footer, so the PDF has the pages the writer saw.
 * Pageless prints as one flow on the chosen paper. The HTML runs with no script in a hidden window.
 */
import type { EditorView } from "@tiptap/pm/view";
import { CSS_PX_PER_INCH, headerFooterText, styleCss, type PDocFile } from "@p-doc/core";
import type { PrintRequest } from "../../shared/api.ts";
import tokensCss from "@p-doc/tokens/tokens.css?inline";
import pageCss from "../styles/page.css?inline";
import { geometry, layoutNow } from "./pages.ts";

// The editor's own state: selection, find highlights, the empty-document placeholder.
const EDITOR_ONLY = ["ProseMirror-selectednode", "selectedCell", "pd-match", "pd-match-current", "has-focus", "is-empty", "is-editor-empty"];

/** A block's HTML without the editor's own state (selection, find highlights, resize handles). */
function blockHtml(node: Node | null): string {
  if (!(node instanceof HTMLElement)) return "";
  const c = node.cloneNode(true) as HTMLElement;
  for (const x of [c, ...c.querySelectorAll<HTMLElement>("*")]) {
    x.removeAttribute("contenteditable");
    x.removeAttribute("draggable");
    x.removeAttribute("data-placeholder");
    x.classList.remove(...EDITOR_ONLY);
  }
  for (const x of c.querySelectorAll(".column-resize-handle")) x.remove();
  return c.outerHTML;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

const hf = (cls: string, which: "header" | "footer", text: string, align: string) =>
  `<div class="${cls} pd-hf" data-hf="${which}" data-align="${align}"><span class="pd-hf-text">${esc(text)}</span></div>`;

export interface PrintDoc {
  request: PrintRequest;
  /** Pages in Pages mode; null when pageless (the printer lays it out). */
  pages: number | null;
}

export function printDocument(doc: PDocFile, view: EditorView): PrintDoc {
  const p = doc.page;
  const g = geometry(p);
  const blocks: string[] = [];
  view.state.doc.forEach((_n, off) => void blocks.push(blockHtml(view.nodeDOM(off))));
  const layout = p.mode === "pages" ? layoutNow() : null;
  const width = layout ? g.width : g.width - g.left - g.right;
  const vars = `--page-width: ${width}px; --page-pad-top: ${g.top}px; --page-pad-bottom: ${g.bottom}px; --page-pad-left: ${g.left}px; --page-pad-right: ${g.right}px; --page-color: ${esc(p.color)}; --doc-font: ${esc(doc.styles.normal.fontFamily)}`;
  const inch = (px: number) => px / CSS_PX_PER_INCH;
  let body: string;
  let at: string;
  let margins: PrintRequest["margins"];
  if (layout) {
    at = `@page { size: ${g.width}px ${g.height}px; margin: 0 }`;
    margins = { top: 0, bottom: 0, left: 0, right: 0 };
    body = layout.sheets
      .map((sh) => {
        const last = sh.page + sh.span - 1;
        return `<section class="print-sheet" style="--sheet-height: ${sh.span * g.height}px">${hf("print-head", "header", headerFooterText(p, "header", sh.page, layout.pages), p.headerAlign)}<div class="pd-content">${blocks.slice(sh.start, sh.end).join("")}</div>${hf("print-foot", "footer", headerFooterText(p, "footer", last, layout.pages), p.footerAlign)}</section>`;
      })
      .join("");
  } else {
    at = `@page { size: ${g.width}px ${g.height}px; margin: ${g.top}px ${g.right}px ${g.bottom}px ${g.left}px }`;
    margins = { top: inch(g.top), bottom: inch(g.bottom), left: inch(g.left), right: inch(g.right) };
    body = `<section class="print-flow"><div class="pd-content">${blocks.join("")}</div></section>`;
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><title>${esc(doc.title)}</title><style>${tokensCss}\n${pageCss}\n${styleCss(doc.styles, ".print-doc .pd-content")}\n${at}</style></head><body class="print-body"><main class="print-doc${layout ? " paged" : ""}" style="${vars}">${body}</main></body></html>`;
  return { request: { html, title: doc.title, size: { width: inch(g.width), height: inch(g.height) }, margins }, pages: layout?.pages ?? null };
}
