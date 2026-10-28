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
}

export interface Pagination {
  /** Page number (1-based) of each block. */
  pageOf: number[];
  /** Index of the first block on each page (a page a tall block overflows into has no entry of its own). */
  starts: number[];
  pages: number;
  /** Space to add before a block so it starts at the top of its page (px), by block index. */
  push: Map<number, number>;
}

const EPS = 0.5;

export function paginate(blocks: BlockBox[], pageContentHeight: number): Pagination {
  const h = Math.max(1, pageContentHeight);
  const pageOf: number[] = [];
  const starts: number[] = [0];
  const push = new Map<number, number>();
  let page = 1;
  let used = 0;
  /** Bottom of the lowest float on the page, from the top of the page's text. */
  let floats = 0;
  let breakNext = false;
  blocks.forEach((b, i) => {
    const need = Math.max(b.height, b.float ?? 0);
    if (i > 0 && (breakNext || (Math.max(used, floats) > 0 && used + need > h + EPS))) {
      push.set(i, Math.max(0, h - Math.max(used, floats)));
      page++;
      starts.push(i);
      used = 0;
      floats = 0;
    }
    breakNext = Boolean(b.pageBreak);
    pageOf.push(page);
    if (b.float) floats = Math.min(h, Math.max(floats, used + b.float));
    used += b.height;
    if (used > h + EPS) {
      const extra = Math.ceil((used - EPS) / h) - 1;
      page += extra;
      used -= extra * h;
    }
  });
  return { pageOf, starts, pages: page, push };
}

/** A run of blocks laid out on one sheet: one page, or several when a tall block overflows its page. */
export interface Sheet {
  /** First block index. */
  start: number;
  /** One past the last block index. */
  end: number;
  /** Page number (1-based) of the sheet's first page. */
  page: number;
  /** Pages the sheet covers. */
  span: number;
}

export function sheetsOf(p: Pagination): Sheet[] {
  const n = p.pageOf.length;
  return p.starts.map((start, k) => {
    const end = p.starts[k + 1] ?? n;
    const page = p.pageOf[start] ?? 1;
    const nextPage = k + 1 < p.starts.length ? (p.pageOf[p.starts[k + 1]!] ?? page + 1) : p.pages + 1;
    return { start, end, page, span: Math.max(1, nextPage - page) };
  });
}

export const CSS_PX_PER_INCH = 96;
