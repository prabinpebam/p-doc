/**
 * Block-level pagination (O2): blocks that don't fit move to the next page; a block taller than a
 * page starts a page and overflows into the following ones. The same result lays out the screen and
 * the printed PDF, so both have the same pages (A1).
 */

export interface BlockBox {
  /** Height including its share of the margin to the next block, in CSS px. */
  height: number;
  /** A manual page break: the next block starts a page. */
  pageBreak?: boolean;
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
  let breakNext = false;
  blocks.forEach((b, i) => {
    if (i > 0 && (breakNext || (used > 0 && used + b.height > h + EPS))) {
      push.set(i, Math.max(0, h - used));
      page++;
      starts.push(i);
      used = 0;
    }
    breakNext = Boolean(b.pageBreak);
    pageOf.push(page);
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
