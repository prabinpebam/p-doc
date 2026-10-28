/**
 * Block-level pagination (O2): blocks that don't fit move to the next page; a block taller than a
 * page starts a page and overflows into the following ones. The same result lays out the screen and
 * the printed PDF, so both have the same pages (A1).
 *
 * A floated block (an image with text wrapped round it, A9) takes no height in the flow: the text
 * after it runs beside it. It needs its own height of room on the page, and the page ends below it
 * (the sheet break clears floats), so the space left on the page counts from its bottom too.
 *
 * Footnotes (A8) sit at the foot of the page their reference is on, under a separator: the page's text
 * area shrinks by them. A line with a reference moves on when its note's first line can't come with it;
 * the last note on a page that doesn't fit whole continues on the next page, above that page's notes.
 */

/** A footnote referenced from a block. */
export interface NoteBox {
  /** Height of the note (px). */
  height: number;
  /** The line of the block its reference is on (asked only when the block splits). */
  line?: () => number;
  /** The bottom of each line of the note but the last, from its top: where it may break when long. */
  lines?: () => number[];
}

/** Where a footnote is drawn: its page, and for a note that continues, how much of it is on that page (px). */
export interface NotePlace {
  page: number;
  cut?: number;
}

export interface BlockBox {
  /** Height including its share of the margin to the next block, in CSS px. */
  height: number;
  /** A manual page break: the next block starts a page. */
  pageBreak?: boolean;
  /** Height of a floated block (with its margins); its `height` in the flow is usually 0. */
  float?: number;
  /**
   * A block that may split between lines (A10): the bottom of each line but the last, from the block's
   * top. Asked only when the block crosses a page end.
   */
  lines?: () => number[];
  /** Widow and orphan control: a split leaves at least two lines on each side. */
  widows?: boolean;
  /** Keep with next (U47): starts on the page the next block starts on, when the run of them fits a page. */
  keepNext?: boolean;
  /** Keep lines together (U47): never splits, unless it is taller than a page. */
  keepLines?: boolean;
  /** Page break before (U47): starts a page, unless it already does. */
  breakBefore?: boolean;
  /** Footnotes referenced from the block, in order. */
  notes?: NoteBox[];
}

export interface Pagination {
  /** Page number (1-based) of each block (of its first line, for a split block). */
  pageOf: number[];
  /** Index of the block each sheet starts in (a page a tall block overflows into has no entry of its own). */
  starts: number[];
  /** The line of that block each sheet starts at: 0 for its top, n when its first n lines are on the page before. */
  startLines: number[];
  /** Space left at the foot of the page before each sheet (px); 0 for the first. */
  fills: number[];
  /** The page each sheet starts on. */
  firsts: number[];
  pages: number;
  /** Space to add before a block so it starts at the top of its page (px), by block index. */
  push: Map<number, number>;
  /** Each footnote's place, in the order of the blocks' `notes`. */
  notes: NotePlace[];
}

export interface PaginateOptions {
  /** Room the separator above a page's footnotes takes (px). */
  noteSep?: number;
}

const EPS = 0.5;

export function paginate(blocks: BlockBox[], pageContentHeight: number, options: PaginateOptions = {}): Pagination {
  const h = Math.max(1, pageContentHeight);
  const sep = options.noteSep ?? 0;
  const pageOf: number[] = [];
  const starts: number[] = [0];
  const startLines: number[] = [0];
  const fills: number[] = [0];
  const firsts: number[] = [1];
  const push = new Map<number, number>();
  let page = 1;
  let used = 0;
  /** Bottom of the lowest float on the page, from the top of the page's text. */
  let floats = 0;
  let breakNext = false;
  /** Room the page's footnotes take, with their separator. */
  let noteH = 0;
  /** The rest of a note continued from the page before (px). */
  let carry = 0;
  const places: NotePlace[] = [];
  /** Index in `places` of each block's first note. */
  const noteBase: number[] = [];
  let noteCount = 0;
  for (const b of blocks) {
    noteBase.push(noteCount);
    noteCount += b.notes?.length ?? 0;
  }
  const newPage = () => {
    used = 0;
    floats = 0;
    noteH = carry > 0 ? sep + carry : 0;
    carry = 0;
  };
  const newSheet = (i: number, line: number, fill: number) => {
    if (line === 0) push.set(i, fill);
    page++;
    firsts.push(page);
    starts.push(i);
    startLines.push(line);
    fills.push(fill);
    newPage();
  };
  /** The notes of block `i` on lines [from, to). */
  const notesOn = (i: number, from = 0, to = Infinity): number[] => {
    const ns = blocks[i]!.notes ?? [];
    const out: number[] = [];
    ns.forEach((n, k) => {
      const line = from === 0 && to === Infinity ? 0 : (n.line?.() ?? 0);
      if (line >= from && line < to) out.push(k);
    });
    return out;
  };
  /** The least room notes need on this page: all of each but the first line of the last (which may continue). */
  const noteNeed = (i: number, ks: number[]): number => {
    if (!ks.length) return 0;
    const ns = blocks[i]!.notes!;
    let need = noteH > 0 ? 0 : sep;
    ks.forEach((k, j) => {
      const n = ns[k]!;
      need += j === ks.length - 1 ? Math.min(n.height, n.lines?.()[0] ?? n.height) : n.height;
    });
    return need;
  };
  /** Puts notes on this page under text that ends `bottom` px down; the last may continue on the next. */
  const placeNotes = (i: number, ks: number[], bottom: number) => {
    const ns = blocks[i]!.notes!;
    for (const k of ks) {
      const n = ns[k]!;
      if (noteH === 0) noteH = sep;
      const room = h - Math.max(bottom, floats) - noteH;
      if (n.height <= room + EPS || carry > 0) {
        places[noteBase[i]! + k] = { page };
        noteH += n.height;
        continue;
      }
      // Break the note at the last line that fits; a note whose first line doesn't fit stays whole (it overflows).
      const cut = (n.lines?.() ?? []).filter((y) => y <= room + EPS).pop();
      if (cut == null || cut <= 0) {
        places[noteBase[i]! + k] = { page };
        noteH += n.height;
        continue;
      }
      places[noteBase[i]! + k] = { page, cut };
      noteH += cut;
      carry = n.height - cut;
    }
  };
  /** Lines the fragment from line `at` (at `offset` px into the block) fits in `room` with their notes, by the widow rule. */
  const fitting = (i: number, ls: number[], at: number, offset: number, room: number, widows: boolean): number => {
    let end = at;
    const noted = !!blocks[i]!.notes?.length;
    while (end < ls.length && ls[end]! - offset + (noted ? noteNeed(i, notesOn(i, at, end + 1)) : 0) <= room + EPS) end++;
    if (!widows) return end;
    const total = ls.length + 1;
    if (total - end < 2) end = total - 2;
    // A first line alone at the foot of a page (orphan) moves on with the rest.
    if (at === 0 && end < 2) return 0;
    return Math.max(at, end);
  };
  const splits = (b: BlockBox) => !!b.lines && !b.float && !(b.keepLines && b.height <= h + EPS);
  /** The height a run kept with the next block needs: all of it, and the start of the block it keeps with. */
  const keptRun = (i: number): number => {
    let need = 0;
    let j = i;
    for (; j < blocks.length && blocks[j]!.keepNext && !blocks[j]!.pageBreak; j++) need += blocks[j]!.height;
    const next = blocks[j];
    if (!next || next.breakBefore) return need;
    if (!splits(next)) return need + next.height;
    // The fewest lines the next block can start with here: two under the widow rule (which needs four to split).
    const ls = next.lines!();
    if (next.widows) return need + (ls.length >= 3 ? ls[1]! : next.height);
    return need + (ls[0] ?? next.height);
  };
  blocks.forEach((b, i) => {
    const need = Math.max(b.height, b.float ?? 0);
    // A page holding only the rest of a note from the page before counts as started: a block that can't fit beside it moves on.
    const full = () => Math.max(used, floats) > 0 || noteH > 0;
    if (i > 0 && (breakNext || (b.breakBefore && full()))) newSheet(i, 0, Math.max(0, h - Math.max(used, floats)));
    breakNext = Boolean(b.pageBreak);
    // A run kept with the next block moves on whole when it doesn't fit here but fits a page; a longer one breaks at the page.
    if (b.keepNext && !b.float && full() && !blocks[i - 1]?.keepNext) {
      const run = keptRun(i);
      if (run <= h + EPS && used + run > h + EPS) newSheet(i, 0, Math.max(0, h - Math.max(used, floats)));
    }
    const all = b.notes?.length ? notesOn(i) : [];
    const fits = !full() || used + need + noteH + noteNeed(i, all) <= h + EPS;
    if (fits && b.height + noteH + noteNeed(i, all) <= h - used + EPS) {
      pageOf.push(page);
      if (b.float) floats = Math.min(h, Math.max(floats, used + b.float));
      used += b.height;
      if (all.length) placeNotes(i, all, used);
      return;
    }
    if (!splits(b)) {
      if (!fits) newSheet(i, 0, Math.max(0, h - Math.max(used, floats)));
      // A page that starts with the rest of a long note: a block that fits a page but not beside it moves on.
      if (noteH > 0 && Math.max(used, floats) === 0 && need + noteH > h + EPS && need <= h + EPS) newSheet(i, 0, h);
      pageOf.push(page);
      if (b.float) floats = Math.min(h, Math.max(floats, used + b.float));
      used += b.height;
      if (used > h + EPS) {
        const extra = Math.ceil((used - EPS) / h) - 1;
        page += extra;
        used -= extra * h;
        noteH = 0;
      }
      if (all.length) placeNotes(i, all, used);
      return;
    }
    // Split between lines: as many as fit on each page, the rest on the next.
    const ls = b.lines!();
    const widows = Boolean(b.widows);
    let at = 0;
    let offset = 0;
    let first = true;
    for (;;) {
      const rest = b.height - offset;
      const tail = b.notes?.length ? notesOn(i, at) : [];
      if (rest + noteH + noteNeed(i, tail) <= h - used + EPS) {
        if (first) pageOf.push(page);
        used += rest;
        if (tail.length) placeNotes(i, tail, used);
        return;
      }
      // On an empty page the rule gives way: the lines have nowhere better to go.
      const end = fitting(i, ls, at, offset, h - used - noteH, widows && full());
      if (end === at) {
        if (!full()) {
          // Nothing fits on an empty page: the next line goes on anyway (one taller than a page overflows).
          if (at >= ls.length) {
            if (first) pageOf.push(page);
            used += rest;
            const extra = Math.ceil((used - EPS) / h) - 1;
            page += extra;
            used -= extra * h;
            if (extra > 0) noteH = 0;
            if (tail.length) placeNotes(i, tail, used);
            return;
          }
          const fill = Math.max(0, h - (ls[at]! - offset));
          if (first) pageOf.push(page);
          first = false;
          const line = b.notes?.length ? notesOn(i, at, at + 1) : [];
          if (line.length) placeNotes(i, line, ls[at]! - offset);
          offset = ls[at]!;
          at += 1;
          newSheet(i, at, fill);
          continue;
        }
        newSheet(i, at, Math.max(0, h - Math.max(used, floats)));
        continue;
      }
      if (first) pageOf.push(page);
      first = false;
      const fill = Math.max(0, h - Math.max(used + ls[end - 1]! - offset, floats));
      const part = b.notes?.length ? notesOn(i, at, end) : [];
      if (part.length) placeNotes(i, part, used + ls[end - 1]! - offset);
      offset = ls[end - 1]!;
      at = end;
      newSheet(i, at, fill);
    }
  });
  for (let k = 0; k < noteCount; k++) places[k] ??= { page };
  return { pageOf, starts, startLines, fills, firsts, pages: page, push, notes: places };
}

/**
 * Page numbers that change the layout they come from (contents, page references, A19): lay out, measure the
 * blocks again with the numbers that layout gives, and repeat until nothing moves. `measure` gets the last
 * layout (null on the first pass). It settles in two passes when every number takes the room of the widest
 * one (`digitsFor`), so text holding numbers changes size only when the largest number gains a digit.
 */
export function settlePages(
  measure: (last: Pagination | null) => BlockBox[],
  pageContentHeight: number,
  options: PaginateOptions = {},
  maxPasses = 5,
): { pagination: Pagination; passes: number } {
  let last: Pagination | null = null;
  for (let pass = 1; pass <= maxPasses; pass++) {
    const next = paginate(measure(last), pageContentHeight, options);
    if (last && next.pages === last.pages && next.pageOf.every((p, i) => p === last!.pageOf[i])) return { pagination: last, passes: pass - 1 };
    last = next;
  }
  return { pagination: last!, passes: maxPasses };
}

/** How many digits each page number makes room for: those of the largest number shown (at least one). */
export const digitsFor = (numbers: Iterable<number>): number => String(Math.max(1, ...numbers)).length;

/** A run of blocks laid out on one sheet: one page, or several when a tall block overflows its page. */
export interface Sheet {
  /** First block index. */
  start: number;
  /** The line of the first block the sheet starts at (0: its top). */
  startLine: number;
  /** One past the last block index (a block split onto the next sheet counts in both). */
  end: number;
  /** Page number (1-based) of the sheet's first page. */
  page: number;
  /** Pages the sheet covers. */
  span: number;
}

export function sheetsOf(p: Pagination): Sheet[] {
  const n = p.pageOf.length;
  return p.starts.map((start, k) => {
    const next = p.starts[k + 1];
    const nextLine = p.startLines[k + 1] ?? 0;
    // A block split onto the next sheet counts in both; a sheet holding only the rest of a note has no blocks.
    const end = next == null ? n : next + (nextLine > 0 ? 1 : 0);
    const first = p.firsts[k] ?? 1;
    const nextPage = p.firsts[k + 1] ?? p.pages + 1;
    return { start, startLine: p.startLines[k] ?? 0, end, page: first, span: Math.max(1, nextPage - first) };
  });
}

export const CSS_PX_PER_INCH = 96;
