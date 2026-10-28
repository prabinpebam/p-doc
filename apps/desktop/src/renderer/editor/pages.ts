/**
 * Pages in the live editor (O2, U13–U15): top-level blocks are measured, laid out by `paginate`, and a
 * sheet break (the rest of the page, its footer, the gap, the next page's header) is drawn before the
 * first block of each new sheet as a widget. The same layout prints and makes the PDF (A1, print.ts).
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView, type NodeView } from "@tiptap/pm/view";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { CSS_PX_PER_INCH, headerFooterText, notesOf, pageInches, paginate, sheetsOf, type BlockBox, type HfAlign, type NoteBox, type PageSetup, type Sheet, type TocEntry } from "@p-doc/core";
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
  /**
   * For a sheet that starts inside a split paragraph (A10): the document position of its first line,
   * and the paragraph's left and right inset from the text area (px), so the break spans the page.
   */
  splits: ({ pos: number; left: number; right: number } | null)[];
  /** Page of each heading, by id, for the table of contents. */
  headings: Record<string, number>;
  /** Footnotes at the foot of their page (A8). */
  notes: PlacedNote[];
  /** The rest of each footnote continued from the page before. */
  rests: PlacedNote[];
}

/**
 * A footnote (or the rest of one) at the foot of a page: `y` from the top of its sheet's text, `top`
 * from the top of the editor; `cut` is how much of the note this page shows (the rest goes on the next).
 */
export interface PlacedNote {
  id: string;
  page: number;
  sheet: number;
  y: number;
  top: number;
  height: number;
  cut?: number;
  /** The first on its page: the separator is drawn above it. */
  first: boolean;
}

/** The gap drawn between sheets (px), read once from its token. */
let gapPx = -1;
function pageGap(): number {
  if (gapPx >= 0) return gapPx;
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;height:var(--c-page-gap)";
  document.body.append(probe);
  gapPx = probe.getBoundingClientRect().height;
  probe.remove();
  return gapPx;
}

/** The page a document position is on: a split paragraph's later lines are on the pages after. */
export function pageAt(layout: Layout, index: number, pos: number): number {
  let page = layout.pageOf[index] ?? 1;
  layout.sheets.forEach((sh, k) => {
    const split = layout.splits[k];
    if (split && sh.start === index && pos >= split.pos) page = sh.page;
  });
  return page;
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
  edited = true;
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
  const boxes: BlockBox[] = [];
  /** Line starts of the paragraphs asked for their lines, by block index. */
  const lineStarts = new Map<number, { pos: number[]; left: number; right: number }>();
  const domRect = view.dom.getBoundingClientRect();
  const contentLeft = domRect.left + (parseFloat(getComputedStyle(view.dom).paddingLeft) || 0) * scale;
  const contentRight = domRect.right - (parseFloat(getComputedStyle(view.dom).paddingRight) || 0) * scale;
  const headingAt: [string, number][] = [];
  // Footnotes: each one's height and lines, by id, from where it is drawn now (at a page foot or after the text).
  const box = notesOf(view.state.doc);
  const noteEls = new Map<string, { el: HTMLElement; height: number }>();
  if (box)
    box.node.forEach((n, off) => {
      if (n.attrs.kind !== "footnote") return;
      const e = view.nodeDOM(box.pos + 1 + off);
      // A note cut at a page foot is drawn shorter than it is: its whole height is its content's.
      if (e instanceof HTMLElement) noteEls.set(String(n.attrs.id), { el: e, height: e.classList.contains("pd-note--cut") ? e.scrollHeight : e.getBoundingClientRect().height / scale });
    });
  const noteIds: string[] = [];
  // Each block's height is where its bottom is less where the block before it ended (or its sheet began):
  // that counts margins, and any gap where a block that can't sit beside a float moved below it.
  const rootCs = getComputedStyle(view.dom);
  let flowEnd = view.dom.getBoundingClientRect().top + (parseFloat(rootCs.borderTopWidth) + parseFloat(rootCs.paddingTop) || 0) * scale;
  view.state.doc.forEach((node, offset, i) => {
    const el = view.nodeDOM(offset);
    let height = 0;
    let float: number | undefined;
    let lines: (() => number[]) | undefined;
    if (el instanceof HTMLElement && el.getClientRects().length) {
      const before = el.previousElementSibling;
      if (before?.classList.contains("pd-sheet-break")) flowEnd = before.getBoundingClientRect().bottom;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const top = Math.min(flowEnd, r.top - (parseFloat(cs.marginTop) || 0) * scale);
      const bottom = r.bottom + (parseFloat(cs.marginBottom) || 0) * scale;
      // A break drawn inside a split paragraph is not the paragraph's own height.
      const inner = [...el.querySelectorAll<HTMLElement>(".pd-sheet-break")].map((b) => b.getBoundingClientRect());
      height = Math.max(0, bottom - top - inner.reduce((sum, b) => sum + b.height, 0)) / scale;
      if (cs.float !== "none") [float, height] = [height, 0];
      else flowEnd = bottom;
      if (node.type.name === "paragraph" && cs.float === "none") {
        lines = () => {
          const m = measureLines(view, el, top, inner, scale);
          lineStarts.set(i, { pos: m.pos, left: (r.left - contentLeft) / scale, right: (contentRight - r.right) / scale });
          return m.bottoms;
        };
      }
    }
    let notes: NoteBox[] | undefined;
    if (noteEls.size && node.type.name !== "notes") {
      node.descendants((n, p) => {
        if (n.type.name !== "noteRef" || n.attrs.kind !== "footnote") return;
        const m = noteEls.get(String(n.attrs.id));
        if (!m) return;
        const at = offset + 1 + p;
        noteIds.push(String(n.attrs.id));
        (notes ??= []).push({
          height: m.height,
          // The line the number is on: lines() has measured where each line starts.
          line: () => {
            const starts = lineStarts.get(i)?.pos ?? [];
            let k = 0;
            while (k + 1 < starts.length && starts[k + 1]! <= at) k++;
            return k;
          },
          lines: () => measureLines(view, m.el, m.el.getBoundingClientRect().top, [], scale).bottoms,
        });
      });
    }
    const layout = (node.attrs.layout ?? null) as { keepNext?: boolean; keepLines?: boolean; breakBefore?: boolean; widows?: boolean } | null;
    boxes.push({
      height,
      pageBreak: node.type.name === "pageBreak",
      float,
      lines,
      widows: layout?.widows !== false,
      keepNext: !!layout?.keepNext,
      keepLines: !!layout?.keepLines,
      breakBefore: !!layout?.breakBefore,
      notes,
    });
    if (node.type.name === "heading" && node.attrs.id) headingAt.push([String(node.attrs.id), i]);
  });
  const sep = parseFloat(rootCs.getPropertyValue("--doc-note-sep")) || 0;
  const p = paginate(boxes, g.content, { noteSep: sep });
  const sheets = sheetsOf(p);
  const headings: Record<string, number> = {};
  for (const [id, i] of headingAt) headings[id] = p.pageOf[i] ?? 1;
  const splits = sheets.map((sh) => {
    if (!sh.startLine) return null;
    const l = lineStarts.get(sh.start);
    const pos = l?.pos[sh.startLine];
    return l && pos != null ? { pos, left: l.left, right: l.right } : null;
  });
  const placed = placeNotes(p.notes, noteIds, noteEls, sheets, g, parseFloat(rootCs.paddingTop) || 0);
  apply(view, settle(layoutOf(view.state), { pages: p.pages, sheets, pageOf: p.pageOf, fills: p.fills, splits, headings, ...placed }));
}

/**
 * Where each footnote is drawn: the notes of a page stack up from the foot of its text area, the rest
 * of a note continued from the page before first, under the separator.
 */
function placeNotes(
  places: { page: number; cut?: number }[],
  ids: string[],
  els: Map<string, { height: number }>,
  sheets: Sheet[],
  g: Geometry,
  padTop: number,
): { notes: PlacedNote[]; rests: PlacedNote[] } {
  const notes: PlacedNote[] = [];
  const rests: PlacedNote[] = [];
  if (!ids.length) return { notes, rests };
  const gap = pageGap();
  const tops: number[] = [];
  let acc = 0;
  for (const sh of sheets) {
    tops.push(acc);
    acc += sh.span * g.height + gap;
  }
  const sheetOf = (page: number) => {
    const k = sheets.findIndex((sh) => page >= sh.page && page < sh.page + sh.span);
    return k < 0 ? sheets.length - 1 : k;
  };
  const byPage = new Map<number, { id: string; size: number; cut?: number; rest?: boolean; height: number }[]>();
  const add = (page: number, x: { id: string; size: number; cut?: number; rest?: boolean; height: number }) => {
    const list = byPage.get(page) ?? [];
    list.push(x);
    byPage.set(page, list);
  };
  ids.forEach((id, k) => {
    const at = places[k];
    const height = els.get(id)?.height ?? 0;
    if (!at) return;
    if (at.cut != null) {
      add(at.page, { id, size: at.cut, cut: at.cut, height });
      add(at.page + 1, { id, size: height - at.cut, cut: at.cut, rest: true, height });
    } else add(at.page, { id, size: height, height });
  });
  for (const [page, list] of byPage) {
    const k = sheetOf(page);
    const sh = sheets[k]!;
    const area = list.reduce((sum, x) => sum + x.size, 0);
    let y = (page - sh.page) * g.height + g.content - area;
    list.forEach((x, j) => {
      const placed: PlacedNote = { id: x.id, page, sheet: k, y, top: padTop + tops[k]! + y, height: x.size, first: j === 0, ...(x.cut != null ? { cut: x.cut } : {}) };
      (x.rest ? rests : notes).push(placed);
      y += x.size;
    });
  }
  return { notes, rests };
}

/**
 * A paragraph's lines (A10): where each line starts in the document, and the boundary below each line
 * but the last, from the block's top in page px. Breaks already drawn inside it are taken out, so the
 * lines measure as if the paragraph were whole.
 */
function measureLines(view: EditorView, el: HTMLElement, top: number, inner: DOMRect[], scale: number): { bottoms: number[]; pos: number[] } {
  const shift = (y: number) => inner.reduce((sum, b) => (b.bottom <= y + 1 ? sum + b.height : sum), 0);
  const lines: { top: number; bottom: number; pos: number }[] = [];
  const add = (r: { top: number; bottom: number }, at: () => number) => {
    const t = r.top - shift(r.top);
    const b = r.bottom - shift(r.top);
    const last = lines[lines.length - 1];
    // Glyph boxes can be taller than the line, so neighbouring lines overlap: compare their middles.
    if (last && Math.abs((t + b) / 2 - (last.top + last.bottom) / 2) < Math.min(b - t, last.bottom - last.top) / 2) {
      last.top = Math.min(last.top, t);
      last.bottom = Math.max(last.bottom, b);
    } else lines.push({ top: t, bottom: b, pos: at() });
  };
  const range = document.createRange();
  const charTop = (node: Text, o: number) => {
    range.setStart(node, o);
    range.setEnd(node, o + 1);
    const r = range.getBoundingClientRect();
    return r.height ? r.top : -Infinity;
  };
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => ((n as Element).classList?.contains("pd-sheet-break") ? NodeFilter.FILTER_REJECT : n.nodeType === Node.TEXT_NODE || n.nodeName === "BR" ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeName === "BR") {
      const r = (n as Element).getBoundingClientRect();
      if (r.height) add(r, () => view.posAtDOM(n!.parentNode!, Array.prototype.indexOf.call(n!.parentNode!.childNodes, n)));
      continue;
    }
    const text = n as Text;
    if (!text.length) continue;
    range.selectNodeContents(text);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0);
    let from = 0;
    rects.forEach((r, j) => {
      if (j > 0) {
        // The first character on this rect's line.
        let lo = from + 1;
        let hi = text.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (charTop(text, mid) >= r.top - 1) hi = mid;
          else lo = mid + 1;
        }
        from = lo;
      }
      const at = from;
      add(r, () => view.posAtDOM(text, at));
    });
  }
  range.detach();
  const bottoms: number[] = [];
  for (let k = 0; k + 1 < lines.length; k++) bottoms.push(((lines[k]!.bottom + lines[k + 1]!.top) / 2 - top) / scale);
  return { bottoms, pos: lines.map((l) => l.pos) };
}

/** The layout drawn before the one on screen, and whether the document or setup changed since. */
let before: Layout | null = null;
let edited = true;

/**
 * Text beside a float rewraps when it moves to the next page, which can move it back (A9). Measuring
 * that only returns to the layout before keeps the one drawn now; an edit allows any layout again.
 */
function settle(current: Layout | null, next: Layout): Layout | null {
  if (!edited && before && current && !sameLayout(next, current) && sameLayout(next, before)) return current;
  edited = false;
  if (!sameLayout(next, current)) before = current;
  return next;
}

/** Within half a pixel is the same layout: measuring again after drawing must settle, not loop. */
function sameLayout(a: Layout | null, b: Layout | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.pages === b.pages &&
    a.sheets.length === b.sheets.length &&
    a.sheets.every((s, k) => s.start === b.sheets[k]!.start && s.startLine === b.sheets[k]!.startLine && s.span === b.sheets[k]!.span) &&
    a.splits.every((s, k) => s?.pos === b.splits[k]?.pos) &&
    a.fills.every((f, k) => Math.abs(f - b.fills[k]!) < 0.5) &&
    a.pageOf.length === b.pageOf.length &&
    JSON.stringify(a.headings) === JSON.stringify(b.headings) &&
    notesKey(a) === notesKey(b)
  );
}

const notesKey = (l: Layout) => [...l.notes, ...l.rests].map((n) => `${n.id}:${n.page}:${n.top.toFixed(0)}:${n.height.toFixed(0)}:${n.cut?.toFixed(0) ?? ""}`).join(",");

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
  // Footnotes moved to (or from) a page foot change their own size and the text's: measure again.
  if (layout && notesKey(layout) !== (old ? notesKey(old) : "")) schedule();
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
  const split = layout.splits[k];
  if (split) {
    root.classList.add("pd-sheet-break--inside");
    root.style.setProperty("--inset-left", `${split.left.toFixed(2)}px`);
    root.style.setProperty("--inset-right", `${split.right.toFixed(2)}px`);
  }
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
    const split = layout.splits[k];
    const at = split ? split.pos : offsets[sh.start]!;
    const key = ["sheet", k, sh.page, split ? `${split.pos}:${split.left.toFixed(1)}:${split.right.toFixed(1)}` : "", layout.pages, layout.fills[k]!.toFixed(1), s.header, s.footer, s.firstHeader, s.firstFooter, s.differentFirstPage, s.headerAlign, s.footerAlign].join("|");
    decos.push(Decoration.widget(at, () => sheetBreak(s, layout, k), { side: -1, key, ignoreSelection: true, stopEvent: () => true }));
  });
  return DecorationSet.create(doc, [...decos, ...tocDecos(doc, layout), ...noteDecos(doc, layout)]);
}

/**
 * Footnotes drawn at the foot of their page: each note is placed where the layout put it (cut short when
 * it continues), and the rest of a continued note is drawn at the top of the next page's notes.
 */
function noteDecos(doc: PMNode, layout: Layout): Decoration[] {
  const box = notesOf(doc);
  if (!box || (!layout.notes.length && !layout.rests.length)) return [];
  const byId = new Map(layout.notes.map((n) => [n.id, n]));
  const decos: Decoration[] = [];
  box.node.forEach((n, off) => {
    const at = byId.get(String(n.attrs.id));
    if (!at || n.attrs.kind !== "footnote") return;
    const from = box.pos + 1 + off;
    const cls = `pd-note--placed${at.first ? " pd-note--page-first" : ""}${at.cut != null ? " pd-note--cut" : ""}`;
    const style = `top: ${at.top.toFixed(2)}px${at.cut != null ? `; height: ${at.cut.toFixed(2)}px` : ""}`;
    decos.push(Decoration.node(from, from + n.nodeSize, { class: cls, style }, { placedNote: true }));
  });
  for (const r of layout.rests) {
    const key = ["rest", r.id, r.top.toFixed(1), r.height.toFixed(1), r.cut?.toFixed(1)].join("|");
    decos.push(Decoration.widget(box.pos + 1, (view) => noteRest(view, r), { side: -1, key, ignoreSelection: true, stopEvent: () => true, placedNote: true }));
  }
  return decos;
}

/** The rest of a continued footnote: the note drawn again, shifted up by the part shown on the page before. */
export function noteRest(view: EditorView, r: PlacedNote): HTMLElement {
  const outer = el("div", `pd-note-rest${r.first ? " pd-note--page-first" : ""}`);
  outer.contentEditable = "false";
  outer.style.top = `${r.top.toFixed(2)}px`;
  outer.style.height = `${r.height.toFixed(2)}px`;
  outer.dataset.id = r.id;
  const box = notesOf(view.state.doc);
  box?.node.forEach((n) => {
    if (String(n.attrs.id) !== r.id) return;
    const inner = DOMSerializer.fromSchema(view.state.schema).serializeNode(n) as HTMLElement;
    inner.style.marginTop = `${-(r.cut ?? 0).toFixed(2)}px`;
    outer.append(inner);
  });
  return outer;
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
  const old = mapped.find(undefined, undefined, (spec) => "tocPages" in spec || "placedNote" in spec);
  const fresh = [...tocDecos(tr.doc, layout), ...noteDecos(tr.doc, layout)];
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
              if (v.state.doc !== prev.doc) {
                edited = true;
                schedule();
              }
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
