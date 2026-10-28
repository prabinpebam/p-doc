/**
 * Pages in the live editor (O2, U13–U15): top-level blocks are measured, laid out by `paginate`, and a
 * sheet break (the rest of the page, its footer, the gap, the next page's header) is drawn before the
 * first block of each new sheet as a widget. The same layout prints and makes the PDF (A1, print.ts).
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView, type NodeView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { CSS_PX_PER_INCH, headerFooterText, pageInches, paginate, sheetsOf, type HfAlign, type PageSetup, type Sheet, type TocEntry } from "@p-doc/core";
import { createStore } from "../lib/store.ts";

/** A page's geometry in CSS pixels, rounded as the page is drawn. */
export interface Geometry {
  width: number;
  height: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** Height for text: the page less its top and bottom margins. */
  content: number;
}

export function geometry(p: PageSetup): Geometry {
  const { width, height } = pageInches(p);
  const px = (inches: number) => Math.round(inches * CSS_PX_PER_INCH);
  const g = { width: px(width), height: px(height), top: px(p.margins.top), bottom: px(p.margins.bottom), left: px(p.margins.left), right: px(p.margins.right) };
  return { ...g, content: Math.max(CSS_PX_PER_INCH, g.height - g.top - g.bottom) };
}

export interface Layout {
  pages: number;
  sheets: Sheet[];
  /** Page of each top-level block. */
  pageOf: number[];
  /** Space left at the end of the sheet before each sheet (px); 0 for the first. */
  fills: number[];
  /** Page of each heading, by id, for the table of contents. */
  headings: Record<string, number>;
}

/** The layout for views outside the editor (sheets, page count, the status bar). */
export const pageLayout = createStore<{ layout: Layout | null }>({ layout: null });

interface PagesState {
  layout: Layout | null;
  deco: DecorationSet;
}

export const pagesKey = new PluginKey<PagesState>("pdoc-pages");
export const layoutOf = (state: EditorState) => pagesKey.getState(state)?.layout ?? null;

let setup: PageSetup | null = null;
let activeView: EditorView | null = null;
let frame = 0;

/** The open document's page setup; pages are laid out again when it changes. */
export function setPageSetup(p: PageSetup | null): void {
  if (JSON.stringify(p) === JSON.stringify(setup)) return;
  setup = p;
  schedule();
}

/** Lays out the pages on the next frame (once, however often it's asked). */
export function schedule(): void {
  if (frame || !activeView) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (activeView && !activeView.isDestroyed) measure(activeView);
  });
}

/** Lays out the pages now (print uses it so the PDF has the layout on screen). */
export function layoutNow(): Layout | null {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  if (activeView && !activeView.isDestroyed) measure(activeView);
  return activeView ? layoutOf(activeView.state) : null;
}

function measure(view: EditorView): void {
  const s = setup;
  if (!s || s.mode !== "pages") return apply(view, null);
  const g = geometry(s);
  const sheet = view.dom.closest<HTMLElement>(".page");
  const scale = sheet ? sheet.getBoundingClientRect().width / g.width || 1 : 1;
  const boxes: { height: number; pageBreak: boolean }[] = [];
  const headingAt: [string, number][] = [];
  view.state.doc.forEach((node, offset, i) => {
    const el = view.nodeDOM(offset);
    let height = 0;
    if (el instanceof HTMLElement) {
      const cs = getComputedStyle(el);
      height = el.getBoundingClientRect().height / scale + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
    }
    boxes.push({ height, pageBreak: node.type.name === "pageBreak" });
    if (node.type.name === "heading" && node.attrs.id) headingAt.push([String(node.attrs.id), i]);
  });
  const p = paginate(boxes, g.content);
  const sheets = sheetsOf(p);
  const headings: Record<string, number> = {};
  for (const [id, i] of headingAt) headings[id] = p.pageOf[i] ?? 1;
  apply(view, { pages: p.pages, sheets, pageOf: p.pageOf, fills: sheets.map((sh) => (sh.start === 0 ? 0 : (p.push.get(sh.start) ?? 0))), headings });
}

/** Within half a pixel is the same layout: measuring again after drawing must settle, not loop. */
function sameLayout(a: Layout | null, b: Layout | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.pages === b.pages &&
    a.sheets.length === b.sheets.length &&
    a.sheets.every((s, k) => s.start === b.sheets[k]!.start && s.span === b.sheets[k]!.span) &&
    a.fills.every((f, k) => Math.abs(f - b.fills[k]!) < 0.5) &&
    a.pageOf.length === b.pageOf.length &&
    JSON.stringify(a.headings) === JSON.stringify(b.headings)
  );
}

/** The page setup the sheet breaks were drawn with ("" for none): header text changes redraw them. */
let drawn = "";

function apply(view: EditorView, layout: Layout | null): void {
  const old = layoutOf(view.state);
  if (sameLayout(old, layout) && drawn === (layout ? JSON.stringify(setup) : "")) {
    if (pageLayout.get().layout !== old) pageLayout.set({ layout: old });
    return;
  }
  view.dispatch(view.state.tr.setMeta(pagesKey, layout).setMeta("addToHistory", false));
  pageLayout.set({ layout });
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** A header or footer area; double-click opens Insert > Header and footer (the page area listens). */
export function hfArea(cls: string, text: string, align: HfAlign, page: number): HTMLElement {
  const e = el("div", `${cls} pd-hf`);
  e.dataset.hf = cls.includes("head") ? "header" : "footer";
  e.dataset.page = String(page);
  e.dataset.align = align;
  e.append(el("span", "pd-hf-text", text));
  return e;
}

function sheetBreak(s: PageSetup, layout: Layout, k: number): HTMLElement {
  const sh = layout.sheets[k]!;
  const end = sh.page - 1;
  const root = el("div", "pd-sheet-break");
  root.contentEditable = "false";
  root.dataset.pageEnd = String(end);
  root.style.setProperty("--fill", `${layout.fills[k]!.toFixed(2)}px`);
  root.append(
    el("div", "pd-sheet-fill"),
    hfArea("pd-sheet-foot", headerFooterText(s, "footer", end, layout.pages), s.footerAlign, end),
    el("div", "pd-sheet-gap"),
    hfArea("pd-sheet-head", headerFooterText(s, "header", sh.page, layout.pages), s.headerAlign, sh.page),
  );
  return root;
}

function decorations(doc: PMNode, layout: Layout, s: PageSetup): DecorationSet {
  const offsets: number[] = [];
  doc.forEach((_n, off) => void offsets.push(off));
  const decos: Decoration[] = [];
  layout.sheets.forEach((sh, k) => {
    if (k === 0 || offsets[sh.start] == null) return;
    const key = ["sheet", k, sh.page, layout.pages, layout.fills[k]!.toFixed(1), s.header, s.footer, s.firstHeader, s.firstFooter, s.differentFirstPage, s.headerAlign, s.footerAlign].join("|");
    decos.push(Decoration.widget(offsets[sh.start]!, () => sheetBreak(s, layout, k), { side: -1, key, ignoreSelection: true, stopEvent: () => true }));
  });
  return DecorationSet.create(doc, [...decos, ...tocDecos(doc, layout)]);
}

/** Tables of contents show page numbers: their node view reads them from this decoration. */
function tocDecos(doc: PMNode, layout: Layout): Decoration[] {
  const decos: Decoration[] = [];
  doc.forEach((node, off) => {
    // The pages ride in the attributes too: a decoration only counts as changed when its attributes do.
    if (node.type.name === "tableOfContents") decos.push(Decoration.node(off, off + node.nodeSize, { "data-toc-pages": JSON.stringify(layout.headings) }, { tocPages: layout.headings }));
  });
  return decos;
}

/**
 * After an edit: sheet breaks move with the text; the contents' page numbers are put back on the
 * (possibly replaced) contents node, since keeping it current replaces it.
 */
function remap(deco: DecorationSet, tr: Transaction, layout: Layout | null): DecorationSet {
  const mapped = deco.map(tr.mapping, tr.doc);
  if (!layout) return mapped;
  const old = mapped.find(undefined, undefined, (spec) => "tocPages" in spec);
  const fresh = tocDecos(tr.doc, layout);
  if (!old.length && !fresh.length) return mapped;
  return mapped.remove(old).add(tr.doc, fresh);
}

/** The table of contents with page numbers in Pages mode (renders as the schema does otherwise). */
function tocView(node: PMNode, decos: readonly Decoration[]): NodeView {
  const dom = document.createElement("nav");
  dom.dataset.type = "toc";
  dom.className = "pd-toc";
  let last = "";
  const render = (n: PMNode, d: readonly Decoration[]) => {
    const pages = (d.find((x) => (x.spec as { tocPages?: unknown }).tocPages)?.spec as { tocPages?: Record<string, number> } | undefined)?.tocPages ?? null;
    const entries = (n.attrs.entries ?? []) as TocEntry[];
    const sig = JSON.stringify([entries, pages]);
    if (sig === last) return;
    last = sig;
    dom.setAttribute("data-entries", JSON.stringify(entries));
    dom.replaceChildren(el("p", "pd-toc-title", "Contents"));
    const ul = document.createElement("ul");
    for (const e of entries) {
      const li = el("li", `pd-toc-l${e.level}`);
      const a = document.createElement("a");
      a.href = `#${e.id}`;
      a.textContent = e.text || " ";
      li.append(a);
      if (pages?.[e.id]) li.append(el("span", "pd-toc-dots"), el("span", "pd-toc-page", String(pages[e.id])));
      ul.append(li);
    }
    dom.append(ul);
  };
  render(node, decos);
  return {
    dom,
    update(n, d) {
      if (n.type !== node.type) return false;
      render(n, d);
      return true;
    },
    ignoreMutation: () => true,
  };
}

export const Pages = Extension.create({
  name: "pages",
  addProseMirrorPlugins() {
    return [
      new Plugin<PagesState>({
        key: pagesKey,
        state: {
          init: () => ({ layout: null, deco: DecorationSet.empty }),
          apply(tr, value, _old, state) {
            const meta = tr.getMeta(pagesKey) as Layout | null | undefined;
            if (meta !== undefined) {
              drawn = meta && setup ? JSON.stringify(setup) : "";
              return { layout: meta, deco: meta && setup ? decorations(state.doc, meta, setup) : DecorationSet.empty };
            }
            if (tr.docChanged) return { layout: value.layout, deco: remap(value.deco, tr, value.layout && setup ? value.layout : null) };
            return value;
          },
        },
        props: {
          decorations: (state) => pagesKey.getState(state)?.deco,
          nodeViews: { tableOfContents: (node, _view, _getPos, decos) => tocView(node, decos) },
        },
        view(view) {
          activeView = view;
          const ro = new ResizeObserver(() => schedule());
          ro.observe(view.dom);
          const onLoad = () => schedule();
          view.dom.addEventListener("load", onLoad, true);
          void document.fonts?.ready.then(() => schedule());
          schedule();
          return {
            update(v, prev) {
              if (v.state.doc !== prev.doc) schedule();
            },
            destroy() {
              ro.disconnect();
              view.dom.removeEventListener("load", onLoad, true);
              if (activeView === view) {
                activeView = null;
                pageLayout.set({ layout: null });
              }
            },
          };
        },
      }),
    ];
  },
});
