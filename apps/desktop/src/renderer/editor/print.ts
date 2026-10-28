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
import { geometry, layoutNow, noteRest, type Layout } from "./pages.ts";

// The editor's own state: selection, find highlights, the empty-document placeholder.
const EDITOR_ONLY = ["ProseMirror-selectednode", "selectedCell", "pd-match", "pd-match-current", "has-focus", "is-empty", "is-editor-empty", "is-cropping", "is-resizing", "pd-np-space"];
// Drawn only on screen: resize handles, the crop frame, and an image whose file is missing (exports skip it).
const SCREEN_ONLY = ".pd-np-break, .column-resize-handle, .pd-img-handle, .pd-crop, .pd-img-missing, .pd-img.is-missing";
// Footnotes drawn at a page foot print with their sheet (sheetNotes), not with the notes after the text.
const PLACED = ".pd-note--placed, .pd-note-rest";

/**
 * A block's HTML without the editor's own state (selection, find highlights, resize handles): one part,
 * or for a paragraph split across pages (A10) one part per page, cut where the page breaks inside it.
 */
function blockHtml(node: Node | null, top?: number): string[] {
  if (!(node instanceof HTMLElement)) return [""];
  if (node.matches(".pd-img.is-missing")) return [""];
  const c = node.cloneNode(true) as HTMLElement;
  if (top != null) c.style.top = `${top}px`;
  else for (const x of c.querySelectorAll(PLACED)) x.remove();
  for (const x of [c, ...c.querySelectorAll<HTMLElement>("*")]) {
    x.removeAttribute("contenteditable");
    x.removeAttribute("draggable");
    x.removeAttribute("data-placeholder");
    x.classList.remove(...EDITOR_ONLY);
  }
  for (const x of c.querySelectorAll(SCREEN_ONLY)) x.remove();
  // A decoration's span (a find match, a marked space) leaves nothing behind once its class is gone.
  for (const x of c.querySelectorAll<HTMLElement>("[class]")) if (!x.classList.length) x.removeAttribute("class");
  for (const x of c.querySelectorAll<HTMLElement>("span")) if (!x.attributes.length) x.replaceWith(...x.childNodes);
  c.normalize();
  const parts: string[] = [];
  let rest = c;
  for (;;) {
    const cut = rest.querySelector(".pd-sheet-break");
    if (!cut) break;
    const head = rest.cloneNode(true) as HTMLElement;
    const r = document.createRange();
    r.setStartBefore(head.querySelector(".pd-sheet-break")!);
    r.setEndAfter(head.lastChild!);
    r.deleteContents();
    head.classList.add("pd-split-head");
    parts.push(head.outerHTML);
    r.setStartBefore(rest.firstChild!);
    r.setEndAfter(cut);
    r.deleteContents();
    rest.classList.add("pd-split-tail");
  }
  parts.push(rest.outerHTML);
  return parts;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

const hf = (cls: string, which: "header" | "footer", text: string, align: string) =>
  `<div class="${cls} pd-hf" data-hf="${which}" data-align="${align}"><span class="pd-hf-text">${esc(text)}</span></div>`;

/**
 * A copy of a part of a continued footnote with the text outside its window hidden: the screen only clips it, but
 * a PDF would keep the clipped words, so they would be found (and copied) twice.
 */
function visiblePart(live: HTMLElement): HTMLElement {
  const box = live.getBoundingClientRect();
  const walker = document.createTreeWalker(live, NodeFilter.SHOW_TEXT);
  const r = document.createRange();
  // For each text node (in order), the ranges of characters drawn outside the window.
  const hidden: [number, number][][] = [];
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    const spans: [number, number][] = [];
    for (let i = 0; i < t.length; i++) {
      r.setStart(t, i);
      r.setEnd(t, i + 1);
      const c = r.getBoundingClientRect();
      const mid = (c.top + c.bottom) / 2;
      const out = c.height > 0 && (mid < box.top || mid > box.bottom);
      const last = spans.at(-1);
      if (out) {
        if (last && last[1] === i) last[1] = i + 1;
        else spans.push([i, i + 1]);
      }
    }
    hidden.push(spans);
  }
  const copy = live.cloneNode(true) as HTMLElement;
  const texts: Text[] = [];
  const w2 = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
  for (let t = w2.nextNode() as Text | null; t; t = w2.nextNode() as Text | null) texts.push(t);
  texts.forEach((t, k) => {
    for (const [a, b] of [...(hidden[k] ?? [])].reverse()) {
      const part = t.splitText(a);
      part.splitText(b - a);
      const span = document.createElement("span");
      span.style.visibility = "hidden";
      part.replaceWith(span);
      span.append(part);
    }
  });
  return copy;
}

/** The footnotes at the foot of one sheet's pages, where the layout put them. */
function sheetNotes(view: EditorView, layout: Layout, k: number): string {
  const out: string[] = [];
  for (const r of layout.rests) {
    if (r.sheet !== k) continue;
    const live = [...view.dom.querySelectorAll<HTMLElement>(`.pd-note-rest[data-id="${CSS.escape(r.id)}"]`)].find((x) => Math.abs(parseFloat(x.style.top) - r.top) < 0.5);
    out.push(...blockHtml(live ? visiblePart(live) : noteRest(view, r), r.y));
  }
  for (const n of layout.notes) {
    if (n.sheet !== k) continue;
    const el = view.dom.querySelector<HTMLElement>(`.pd-notes > .pd-note[data-id="${CSS.escape(n.id)}"]`);
    out.push(...blockHtml(el && n.cut != null ? visiblePart(el) : el, n.y));
  }
  return out.join("");
}

export interface PrintDoc {
  request: PrintRequest;
  /** Pages in Pages mode; null when pageless (the printer lays it out). */
  pages: number | null;
}

export function printDocument(doc: PDocFile, view: EditorView): PrintDoc {
  const p = doc.page;
  const g = geometry(p);
  const blocks: string[][] = [];
  view.state.doc.forEach((_n, off) => void blocks.push(blockHtml(view.nodeDOM(off))));
  /** The next part of each block to print: a split block gives one part to each sheet it is on. */
  const next = blocks.map(() => 0);
  const part = (i: number) => blocks[i]![Math.min(next[i]!++, blocks[i]!.length - 1)]!;
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
      .map((sh, k) => {
        const last = sh.page + sh.span - 1;
        return `<section class="print-sheet" style="--sheet-height: ${sh.span * g.height}px">${hf("print-head", "header", headerFooterText(p, "header", sh.page, layout.pages), p.headerAlign)}<div class="pd-content">${Array.from({ length: sh.end - sh.start }, (_, j) => part(sh.start + j)).join("")}${sheetNotes(view, layout, k)}</div>${hf("print-foot", "footer", headerFooterText(p, "footer", last, layout.pages), p.footerAlign)}</section>`;
      })
      .join("");
  } else {
    at = `@page { size: ${g.width}px ${g.height}px; margin: ${g.top}px ${g.right}px ${g.bottom}px ${g.left}px }`;
    margins = { top: inch(g.top), bottom: inch(g.bottom), left: inch(g.left), right: inch(g.right) };
    body = `<section class="print-flow"><div class="pd-content">${blocks.map((b) => b.join("")).join("")}</div></section>`;
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><title>${esc(doc.title)}</title><style>${tokensCss}\n${pageCss}\n${styleCss(doc.styles, ".print-doc .pd-content")}\n${at}</style></head><body class="print-body"><main class="print-doc${layout ? " paged" : ""}" style="${vars}">${body}</main></body></html>`;
  return { request: { html, title: doc.title, size: { width: inch(g.width), height: inch(g.height) }, margins }, pages: layout?.pages ?? null };
}
