/**
 * Pages in the live editor (O2, U13–U15): top-level blocks are measured, laid out by `paginate`, and a
 * sheet break (the rest of the page, its footer, the gap, the next page's header) is drawn before the
 * first block of each new sheet as a widget. The same layout prints and makes the PDF (A1, print.ts).
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView, type NodeView } from "@tiptap/pm/view";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { CSS_PX_PER_INCH, notesOf, pageFaces, pageInches, paginate, sectionIndexAt, sectionsOf, sheetsOf, type BlockBox, type HfAlign, type NoteBox, type PageFace, type PageSetup, type Sheet, type TocEntry, type Watermark, digitsFor } from "@p-doc/core";
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
  splits: ({ pos: number; left: number; right: number; table?: TableSplit } | null)[];
  /** Page of each heading, by id, for the table of contents. */
  headings: Record<string, number>;
  /** Footnotes at the foot of their page (A8). */
  notes: PlacedNote[];
  /** The rest of each footnote continued from the page before. */
  rests: PlacedNote[];
  /** Each sheet's geometry: its first block's section's (U55). */
  geos: Geometry[];
  /** Every sheet of paper as drawn, blank pages included, in order. */
  papers: Paper[];
  /** The page area: as wide as the widest paper, as tall as the sheets and the gaps between them (px). */
  width: number;
  height: number;
  /** For a block in a section whose text column is not the page area's: how far it moves right and how much narrower it is (px). */
  shifts: ({ dx: number; dw: number } | null)[];
  /** Each page's number, header and footer (U57), blank pages included; page n is faces[n - 1]. */
  faces: PageFace[];
}

/**
 * A watermark on a sheet `width` × `height` px (U58): diagonal runs corner to corner, flat across; the words
 * take about 70% of the line they run along, and no more than a fifth of the sheet's width in height.
 */
export function watermarkStyle(w: Watermark, width: number, height: number): Record<string, string> {
  const along = w.layout === "diagonal" ? Math.hypot(width, height) : width;
  const size = Math.min(width / 5, (along * 0.7) / (Math.max(1, [...w.text].length) * 0.6));
  const angle = w.layout === "diagonal" ? -Math.atan2(height, width) * (180 / Math.PI) : 0;
  return { "--wm-color": w.color, "--wm-size": `${size.toFixed(1)}px`, "--wm-angle": `${angle.toFixed(2)}deg` };
}

/** A sheet of paper behind the text: `top` and `left` in the page area, `span` pages tall. */
export interface Paper {
  top: number;
  left: number;
  g: Geometry;
  span: number;
  blank: boolean;
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
  const sections = sectionsOf(view.state.doc, s);
  const geos = sections.map((sec, k) => (k === 0 ? g : geometry(sec.page)));
  const sheet = view.dom.closest<HTMLElement>(".page");
  // The page area is drawn as wide as --page-width says (the widest section's paper once laid out).
  const drawnWidth = parseFloat(sheet?.style.getPropertyValue("--page-width") ?? "") || g.width;
  const scale = sheet ? sheet.getBoundingClientRect().width / drawnWidth || 1 : 1;
  const boxes: BlockBox[] = [];
  /** Line starts of the paragraphs asked for their lines, by block index. */
  const lineStarts = new Map<number, { pos: number[]; left: number; right: number; table?: TableSplit }>();
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
    let repeat = 0;
    if (el instanceof HTMLElement && el.getClientRects().length) {
      const before = el.previousElementSibling;
      if (before?.classList.contains("pd-sheet-break")) flowEnd = before.getBoundingClientRect().bottom;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const top = Math.min(flowEnd, r.top - (parseFloat(cs.marginTop) || 0) * scale);
      const bottom = r.bottom + (parseFloat(cs.marginBottom) || 0) * scale;
      // A break drawn inside a split paragraph or table (and a table's repeated header rows) is not the block's own height.
      const inner = [...el.querySelectorAll<HTMLElement>(INSIDE)].map((b) => b.getBoundingClientRect());
      height = Math.max(0, bottom - top - inner.reduce((sum, b) => sum + b.height, 0)) / scale;
      if (cs.float !== "none") [float, height] = [height, 0];
      else flowEnd = bottom;
      if (node.type.name === "paragraph" && cs.float === "none") {
        lines = () => {
          const m = measureLines(view, el, top, inner, scale);
          lineStarts.set(i, { pos: m.pos, left: (r.left - contentLeft) / scale, right: (contentRight - r.right) / scale });
          return m.bottoms;
        };
      } else if (node.type.name === "table" && cs.float === "none") {
        const t = tableOf(el, node, g.content * scale);
        if (t) {
          repeat = t.repeat / scale;
          lines = () => {
            const m = tableLines(el, node, offset, top, inner, scale, t.heads);
            lineStarts.set(i, { pos: m.pos, left: (r.left - contentLeft) / scale, right: (contentRight - r.right) / scale, table: t.split });
            return m.bottoms;
          };
        }
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
    const sec = node.type.name === "sectionBreak" ? sections.findIndex((x) => x.breakAt === i) : -1;
    boxes.push({
      ...(sec > 0 ? { section: { start: sections[sec]!.start, height: geos[sec]!.content } } : {}),
      height,
      // A column break on one column starts a page, as in Word (columns are laid out later: work plan 11.2b).
      pageBreak: node.type.name === "pageBreak" || node.type.name === "columnBreak",
      float,
      lines,
      ...(repeat ? { repeat } : {}),
      // A table breaks between any two rows (U60): widow control is for lines of text.
      widows: node.type.name !== "table" && layout?.widows !== false,
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
    return l && pos != null ? { pos, left: l.left, right: l.right, ...(l.table ? { table: l.table } : {}) } : null;
  });
  const sheetGeos = sheets.map((sh) => geos[sectionIndexAt(sections, sh.start)]!);
  const paper = papersOf(sheets, sheetGeos, Math.max(...geos.map((x) => x.width)));
  const shifts = boxes.map((_b, i) => shiftOf(geos[sectionIndexAt(sections, i)]!, g, paper.width));
  const placed = placeNotes(p.notes, noteIds, noteEls, sheets, sheetGeos, paper.papers, parseFloat(rootCs.paddingTop) || 0);
  // A blank page before an odd or even section is the last page of the section before it.
  const sectionOfPage: number[] = [];
  for (const sh of sheets) {
    const k = sectionIndexAt(sections, sh.start);
    for (let b = 0; b < sh.blank; b++) sectionOfPage.push(Math.max(0, k - 1));
    for (let j = 0; j < sh.span; j++) sectionOfPage.push(k);
  }
  const faces = pageFaces(s, sections, sectionOfPage);
  apply(view, settle(layoutOf(view.state), { pages: p.pages, sheets, pageOf: p.pageOf, fills: p.fills, splits, headings, ...placed, geos: sheetGeos, ...paper, shifts, faces }));
}

/** The sheets of paper drawn behind the text, centred in a page area as wide as the widest; a blank page has the paper of the page before. */
function papersOf(sheets: Sheet[], geos: Geometry[], width: number): { papers: Paper[]; width: number; height: number } {
  const gap = pageGap();
  const papers: Paper[] = [];
  let y = 0;
  sheets.forEach((sh, k) => {
    const g = geos[k]!;
    if (k > 0) {
      y += gap;
      const prev = geos[k - 1]!;
      for (let b = 0; b < sh.blank; b++) {
        papers.push({ top: y, left: (width - prev.width) / 2, g: prev, span: 1, blank: true });
        y += prev.top + prev.content + prev.bottom + gap;
      }
    }
    papers.push({ top: y, left: (width - g.width) / 2, g, span: sh.span, blank: false });
    y += sh.span * g.content + g.top + g.bottom;
  });
  return { papers, width, height: y };
}

/** How a section's text column sits against the page area's (which has the first section's margins). */
function shiftOf(sec: Geometry, base: Geometry, width: number): { dx: number; dw: number } | null {
  const dx = (width - sec.width) / 2 + sec.left - base.left;
  const dw = width - base.left - base.right - (sec.width - sec.left - sec.right);
  return Math.abs(dx) < 0.5 && Math.abs(dw) < 0.5 ? null : { dx, dw };
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
  geos: Geometry[],
  papers: Paper[],
  padTop: number,
): { notes: PlacedNote[]; rests: PlacedNote[] } {
  const notes: PlacedNote[] = [];
  const rests: PlacedNote[] = [];
  if (!ids.length) return { notes, rests };
  // Where each sheet's text starts, from where the first sheet's does.
  const tops = papers.filter((x) => !x.blank).map((x, k) => x.top + geos[k]!.top - geos[0]!.top);
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
    const g = geos[k]!;
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

/** What a break inside a table draws: the row it is in, and the header rows repeated under it. */
export interface TableSplit {
  /** Columns, for the break row to span. */
  cols: number;
  /** Header rows repeated at the top of the next page. */
  heads: number;
  /** The header rows' content: a change draws them again. */
  key: string;
}

/** Drawn inside a block by the layout, not its own content: a sheet break, and a table's break row and repeated header. */
const INSIDE = ".pd-break-row, .pd-repeat-head, .pd-sheet-break:not(.pd-break-row .pd-sheet-break)";

/**
 * A table's header rows (U60): its first rows whose cells are all header cells, repeated at the top of each
 * page it continues on, as Word's "Repeat as header row". A header taller than a third of the page isn't
 * repeated, and a table of only header rows has none.
 */
function tableOf(el: HTMLElement, node: PMNode, pageHeight: number): { heads: number; repeat: number; split: TableSplit } | null {
  const table = el.matches("table") ? (el as HTMLTableElement) : el.querySelector("table");
  if (!table) return null;
  let heads = 0;
  while (heads < node.childCount && node.child(heads).content.content.every((c) => c.type.name === "tableHeader")) heads++;
  if (heads === node.childCount) heads = 0;
  const rows = ownRows(table);
  let repeat = heads && rows[heads - 1] && rows[0] ? rows[heads - 1]!.getBoundingClientRect().bottom - rows[0].getBoundingClientRect().top : 0;
  if (repeat > pageHeight / 3) [heads, repeat] = [0, 0];
  let cols = 0;
  node.child(0).forEach((c) => void (cols += Number(c.attrs.colspan) || 1));
  const key = Array.from({ length: heads }, (_, j) => node.child(j).toJSON() as unknown);
  return { heads, repeat, split: { cols, heads, key: `${cols}:${JSON.stringify(key)}` } };
}

/** A table's own rows, without the rows the layout draws in it. */
const ownRows = (table: HTMLTableElement) => [...table.rows].filter((r) => !r.matches(".pd-break-row, .pd-repeat-head"));

/**
 * A table's "lines" (U60): it breaks between rows, never inside the header rows or the first row after them,
 * and never through a cell that spans rows. Each line's start is the position of its first row.
 */
function tableLines(el: HTMLElement, node: PMNode, offset: number, top: number, inner: DOMRect[], scale: number, heads: number): { bottoms: number[]; pos: number[] } {
  const table = (el.matches("table") ? el : el.querySelector("table")) as HTMLTableElement;
  const shift = (y: number) => inner.reduce((sum, b) => (b.bottom <= y + 1 ? sum + b.height : sum), 0);
  const rows = ownRows(table);
  const at: number[] = [];
  node.forEach((_r, o) => void at.push(offset + 1 + o));
  const lines: { top: number; bottom: number; pos: number }[] = [];
  let spanned = -Infinity;
  rows.forEach((tr, j) => {
    const r = tr.getBoundingClientRect();
    const t = r.top - shift(r.top);
    const b = r.bottom - shift(r.top);
    const last = lines[lines.length - 1];
    if (last && (j <= heads || t < spanned - 1)) last.bottom = Math.max(last.bottom, b);
    else lines.push({ top: t, bottom: b, pos: at[j] ?? at[at.length - 1]! });
    for (const c of tr.cells) {
      const cr = c.getBoundingClientRect();
      spanned = Math.max(spanned, cr.bottom - shift(cr.top));
    }
  });
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
    a.splits.every((s, k) => s?.pos === b.splits[k]?.pos && s?.table?.key === b.splits[k]?.table?.key) &&
    a.fills.every((f, k) => Math.abs(f - b.fills[k]!) < 0.5) &&
    a.pageOf.length === b.pageOf.length &&
    JSON.stringify(a.headings) === JSON.stringify(b.headings) &&
    notesKey(a) === notesKey(b) &&
    paperKey(a) === paperKey(b) &&
    shiftKey(a) === shiftKey(b) &&
    JSON.stringify(a.faces) === JSON.stringify(b.faces)
  );
}

const paperKey = (l: Layout) => l.papers.map((x) => `${x.top.toFixed(0)}:${x.left.toFixed(0)}:${x.g.width}x${x.g.height}:${x.g.top}:${x.g.bottom}:${x.g.left}:${x.g.right}:${x.span}:${x.blank ? 1 : 0}`).join(",");
const shiftKey = (l: Layout) => `${l.width}|${l.shifts.map((s) => (s ? `${s.dx.toFixed(1)}:${s.dw.toFixed(1)}` : "")).join(",")}`;

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
  // Footnotes moved to (or from) a page foot change their own size and the text's, and a section's
  // text column its paragraphs' heights: measure again.
  if (layout && (notesKey(layout) !== (old ? notesKey(old) : "") || shiftKey(layout) !== (old ? shiftKey(old) : `${geometry(setup!).width}|`))) schedule();
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

/** A header or footer on a sheet of `g`'s paper: as tall as its margin, its text inside the side margins. */
function onPaper(e: HTMLElement, g: Geometry, width: number, height: number): HTMLElement {
  const off = (width - g.width) / 2;
  e.style.height = `${height}px`;
  e.style.paddingLeft = `${off + g.left}px`;
  e.style.paddingRight = `${off + g.right}px`;
  return e;
}

function sheetBreak(s: PageSetup, layout: Layout, k: number): HTMLElement {
  const sh = layout.sheets[k]!;
  const end = sh.page - 1 - sh.blank;
  const before = layout.geos[k - 1]!;
  const after = layout.geos[k]!;
  const W = layout.width;
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
  const head = (page: number, g: Geometry) => onPaper(hfArea("pd-sheet-head", layout.faces[page - 1]?.header ?? "", s.headerAlign, page), g, W, g.top);
  const foot = (page: number, g: Geometry) => onPaper(hfArea("pd-sheet-foot", layout.faces[page - 1]?.footer ?? "", s.footerAlign, page), g, W, g.bottom);
  root.append(el("div", "pd-sheet-fill"), foot(end, before), el("div", "pd-sheet-gap"));
  // An odd or even section that lands on the wrong page leaves a blank page first, with its header and footer.
  for (let b = 1; b <= sh.blank; b++) {
    const skip = el("div", "pd-sheet-skip");
    skip.style.height = `${before.content}px`;
    root.append(head(end + b, before), skip, foot(end + b, before), el("div", "pd-sheet-gap"));
  }
  root.append(head(sh.page, after));
  return root;
}

/** A sheet break inside a table: a row of one cell across every column. */
function breakRow(brk: HTMLElement, cols: number): HTMLElement {
  const tr = el("tr", "pd-break-row");
  tr.contentEditable = "false";
  const td = document.createElement("td");
  td.colSpan = cols;
  td.append(brk);
  tr.append(td);
  return tr;
}

/** A copy of a header row, at the top of a page a table continues on; it can't be edited there. */
function headRow(row: PMNode): HTMLElement {
  const tr = DOMSerializer.fromSchema(row.type.schema).serializeNode(row) as HTMLElement;
  tr.classList.add("pd-repeat-head");
  tr.contentEditable = "false";
  tr.setAttribute("aria-hidden", "true");
  return tr;
}

function decorations(doc: PMNode, layout: Layout, s: PageSetup): DecorationSet {
  const offsets: number[] = [];
  doc.forEach((_n, off) => void offsets.push(off));
  const decos: Decoration[] = [];
  layout.sheets.forEach((sh, k) => {
    if (k === 0 || offsets[sh.start] == null) return;
    const split = layout.splits[k];
    const at = split ? split.pos : offsets[sh.start]!;
    const geo = (x: Geometry) => `${x.width}x${x.height}:${x.top}:${x.bottom}:${x.left}:${x.right}`;
    const key = ["sheet", k, sh.page, sh.blank, layout.width, geo(layout.geos[k - 1]!), geo(layout.geos[k]!), split ? `${split.pos}:${split.left.toFixed(1)}:${split.right.toFixed(1)}` : "", layout.pages, layout.fills[k]!.toFixed(1), JSON.stringify(layout.faces.slice(sh.page - 2 - sh.blank, sh.page)), s.headerAlign, s.footerAlign].join("|");
    if (split?.table) {
      // In a table the break is a row across it, followed by copies of the header rows.
      const t = split.table;
      decos.push(Decoration.widget(at, () => breakRow(sheetBreak(s, layout, k), t.cols), { side: -100, key: `${key}|row|${t.cols}`, ignoreSelection: true, stopEvent: () => true }));
      const table = doc.resolve(at).parent;
      for (let j = 0; j < t.heads && j < table.childCount; j++) {
        const row = table.child(j);
        decos.push(Decoration.widget(at, () => headRow(row), { side: -99 + j, key: `head|${k}|${j}|${t.key}`, ignoreSelection: true, stopEvent: () => true }));
      }
    } else decos.push(Decoration.widget(at, () => sheetBreak(s, layout, k), { side: -1, key, ignoreSelection: true, stopEvent: () => true }));
  });
  return DecorationSet.create(doc, [...decos, ...shiftDecos(doc, layout), ...tocDecos(doc, layout), ...noteDecos(doc, layout)]);
}

/**
 * Blocks of a section whose margins or paper differ from the page area's move to their own text column
 * (U55): page.css moves them by --sec-dx and sets their right margin to --sec-mr (their own right indent
 * and the difference in width). Print sets each sheet's margins instead, so it ignores these.
 */
function shiftDecos(doc: PMNode, layout: Layout): Decoration[] {
  const decos: Decoration[] = [];
  doc.forEach((n, off, i) => {
    const s = layout.shifts[i];
    if (!s) return;
    const l = n.attrs.layout as { right?: number; dir?: string } | null | undefined;
    const own = l?.dir === "rtl" ? (Number(n.attrs.indent) || 0) * 0.5 : (l?.right ?? 0);
    decos.push(Decoration.node(off, off + n.nodeSize, { class: "pd-sec-shift", style: `--sec-dx: ${s.dx.toFixed(2)}px; --sec-mr: calc(${own}in + ${s.dw.toFixed(2)}px)` }));
  });
  return decos;
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
    const links = n.attrs.show === "links";
    const sig = JSON.stringify([entries, pages, links]);
    if (sig === last) return;
    last = sig;
    dom.setAttribute("data-entries", JSON.stringify(entries));
    dom.dataset.levels = String(n.attrs.levels);
    dom.dataset.show = links ? "links" : "pages";
    // Every number takes the room of the widest, so the contents change height only when it gains a digit (A19).
    dom.style.setProperty("--pd-toc-digits", String(digitsFor(Object.values(pages ?? {}))));
    dom.replaceChildren(el("p", "pd-toc-title", "Contents"));
    const ul = document.createElement("ul");
    for (const e of entries) {
      const li = el("li", `pd-toc-l${e.level}`);
      const a = document.createElement("a");
      a.href = `#${e.id}`;
      a.textContent = e.text || " ";
      li.append(a);
      if (!links && pages?.[e.id]) li.append(el("span", "pd-toc-dots"), el("span", "pd-toc-page", String(pages[e.id])));
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
