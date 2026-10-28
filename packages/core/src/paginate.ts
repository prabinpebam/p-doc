/**
 * Block-level pagination (O2): blocks that don't fit move to the next page; a block taller than a
 * page starts a page and overflows into the following ones. The same result lays out the screen and
 * the printed PDF, so both have the same pages (A1).
 *
 * A floated block (an image with text wrapped round it, A9) takes no height in the flow: the text
 * after it runs beside it. It needs its own height of room on the page, and the page ends below it
 * (the sheet break clears floats), so the space left on the page counts from its bottom too.
 */

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
  pages: number;
  /** Space to add before a block so it starts at the top of its page (px), by block index. */
  push: Map<number, number>;
}

const EPS = 0.5;

export function paginate(blocks: BlockBox[], pageContentHeight: number): Pagination {
  const h = Math.max(1, pageContentHeight);
  const pageOf: number[] = [];
  const starts: number[] = [0];
  const startLines: number[] = [0];
  const fills: number[] = [0];
  const push = new Map<number, number>();
  let page = 1;
  let used = 0;
  /** Bottom of the lowest float on the page, from the top of the page's text. */
  let floats = 0;
  let breakNext = false;
  const newSheet = (i: number, line: number, fill: number) => {
    if (line === 0) push.set(i, fill);
    page++;
    starts.push(i);
    startLines.push(line);
    fills.push(fill);
    used = 0;
    floats = 0;
  };
  /** Lines the fragment from line `at` (at `offset` px into the block) fits in `room`, by the widow rule. */
  const fitting = (ls: number[], at: number, offset: number, room: number, widows: boolean): number => {
    let end = at;
    while (end < ls.length && ls[end]! - offset <= room + EPS) end++;
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
    const full = () => Math.max(used, floats) > 0;
    if (i > 0 && (breakNext || (b.breakBefore && full()))) newSheet(i, 0, Math.max(0, h - Math.max(used, floats)));
    breakNext = Boolean(b.pageBreak);
    // A run kept with the next block moves on whole when it doesn't fit here but fits a page; a longer one breaks at the page.
    if (b.keepNext && !b.float && full() && !blocks[i - 1]?.keepNext) {
      const run = keptRun(i);
      if (run <= h + EPS && used + run > h + EPS) newSheet(i, 0, Math.max(0, h - Math.max(used, floats)));
    }
    const fits = !full() || used + need <= h + EPS;
    if (fits && b.height <= h - used + EPS) {
      pageOf.push(page);
      if (b.float) floats = Math.min(h, Math.max(floats, used + b.float));
      used += b.height;
      return;
    }
    if (!splits(b)) {
      if (!fits) newSheet(i, 0, Math.max(0, h - Math.max(used, floats)));
      pageOf.push(page);
      if (b.float) floats = Math.min(h, Math.max(floats, used + b.float));
      used += b.height;
      if (used > h + EPS) {
        const extra = Math.ceil((used - EPS) / h) - 1;
        page += extra;
        used -= extra * h;
      }
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
      if (rest <= h - used + EPS) {
        if (first) pageOf.push(page);
        used += rest;
        return;
      }
      // On an empty page the rule gives way: the lines have nowhere better to go.
      const end = fitting(ls, at, offset, h - used, widows && full());
      if (end === at) {
        if (!full()) {
          // Nothing fits on an empty page: the next line goes on anyway (one taller than a page overflows).
          if (at >= ls.length) {
            if (first) pageOf.push(page);
            used += rest;
            const extra = Math.ceil((used - EPS) / h) - 1;
            page += extra;
            used -= extra * h;
            return;
          }
          const fill = Math.max(0, h - (ls[at]! - offset));
          if (first) pageOf.push(page);
          first = false;
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
      offset = ls[end - 1]!;
      at = end;
      newSheet(i, at, fill);
    }
  });
  return { pageOf, starts, startLines, fills, pages: page, push };
}

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
  let page = 1;
  return p.starts.map((start, k) => {
    const next = p.starts[k + 1];
    const nextLine = p.startLines[k + 1] ?? 0;
    const end = next == null ? n : next + (nextLine > 0 ? 1 : 0);
    // A sheet that starts inside a split block is the page after the one before it.
    const first = k === 0 ? 1 : (p.startLines[k] ?? 0) > 0 ? page : (p.pageOf[start] ?? page);
    const nextPage = next == null ? p.pages + 1 : nextLine > 0 ? first + 1 : (p.pageOf[next] ?? first + 1);
    page = first + Math.max(1, nextPage - first);
    return { start, startLine: p.startLines[k] ?? 0, end, page: first, span: Math.max(1, nextPage - first) };
  });
}

export const CSS_PX_PER_INCH = 96;
