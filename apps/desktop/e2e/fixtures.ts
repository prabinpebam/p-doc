/** Documents for journeys, built the same way every run. */
import type { Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { deflateSync, inflateRawSync } from "node:zlib";

/** Replaces the open document's content, as typing would (it saves and lays out again). */
export async function load(page: Page, doc: unknown): Promise<void> {
  await page.evaluate((d) => (window as unknown as { __pdoc: { getEditor(): { commands: { setContent(c: unknown, o: unknown): void } } } }).__pdoc.getEditor().commands.setContent(d, { emitUpdate: true }), doc);
}

/** The page's layout once it settles: the page count. */
export async function settled(page: Page): Promise<number> {
  const art = page.getByTestId("page");
  let last = -1;
  for (let i = 0; i < 50; i++) {
    const n = Number(await art.getAttribute("data-pages"));
    if (n > 0 && n === last) return n;
    last = n;
    await page.waitForTimeout(100);
  }
  throw new Error("The pages did not settle");
}

const WORDS =
  "the page keeps its own size and margins while the text flows from one sheet to the next as it would on paper and every block that does not fit moves down to start a new page".split(" ");

/** `n` words of plain prose, different for each seed. */
export function prose(n: number, seed: number): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(WORDS[(i * 7 + seed * 13) % WORDS.length]!);
  out[0] = out[0]![0]!.toUpperCase() + out[0]!.slice(1);
  return `${out.join(" ")}.`;
}

const text = (t: string) => ({ type: "text", text: t });
const p = (t: string) => ({ type: "paragraph", content: [text(t)] });
const h = (level: number, t: string, id: string) => ({ type: "heading", attrs: { level, id }, content: [text(t)] });

/**
 * About twenty Letter pages: headings, paragraphs, lists, a table, a quote, a manual page break, and
 * a code block taller than a page (it overflows onto the next page, as in Word).
 */
export function longDocument(): unknown {
  const content: unknown[] = [{ type: "paragraph", attrs: { textStyle: "title" }, content: [text("Pagination fixture")] }];
  for (let s = 1; s <= 16; s++) {
    content.push(h(2, `Section ${s}`, `sec-${s}`));
    for (let i = 0; i < 6; i++) content.push(p(prose(60 + ((s + i) % 5) * 10, s * 10 + i)));
    if (s % 4 === 0)
      content.push({
        type: "bulletList",
        content: [1, 2, 3, 4].map((i) => ({ type: "listItem", content: [p(prose(12, s + i))] })),
      });
    if (s === 5)
      content.push({
        type: "table",
        content: [0, 1, 2, 3].map((r) => ({ type: "tableRow", content: [0, 1, 2].map((c) => ({ type: "tableCell", content: [p(`Cell ${r + 1}.${c + 1}`)] })) })),
      });
    if (s === 6) content.push({ type: "blockquote", content: [p(prose(40, 99))] });
    if (s === 3) content.push({ type: "pageBreak" });
    if (s === 9) content.push({ type: "codeBlock", content: [text(Array.from({ length: 70 }, (_, i) => `line ${i + 1}: ${prose(6, i)}`).join("\n"))] });
  }
  content.push(p("The end."));
  return { type: "doc", content };
}

/**
 * Long paragraphs for splitting at lines (A10): every word is numbered, so the text at the top and foot
 * of each page tells where it broke. One paragraph is longer than a page.
 */
export function splitDocument(): unknown {
  let n = 0;
  const words = (count: number) => Array.from({ length: count }, () => `${WORDS[n % WORDS.length]}${++n}`).join(" ");
  const content: unknown[] = [h(1, "Split fixture", "split")];
  for (let i = 0; i < 24; i++) content.push(p(words(i === 9 ? 900 : 40 + ((i * 37) % 160))));
  return { type: "doc", content };
}

/** A short document with headings for the table of contents. */
export function headedDocument(pages = 3): unknown {
  const content: unknown[] = [];
  for (let s = 1; s <= pages; s++) {
    content.push(h(1, `Chapter ${s}`, `ch-${s}`));
    for (let i = 0; i < 3; i++) content.push(p(prose(50, s * 3 + i)));
    content.push({ type: "pageBreak" });
  }
  content.pop();
  return { type: "doc", content };
}

/** Plain prose of about `pages` Letter pages (ten paragraphs a page, a heading every three pages). */
export function bigDocument(pages: number): unknown {
  const content: unknown[] = [];
  for (let i = 0; i < pages * 10; i++) {
    if (i % 30 === 0) content.push(h(1, `Part ${i / 30 + 1}`, `part-${i / 30 + 1}`));
    content.push(p(prose(70, i)));
  }
  return { type: "doc", content };
}

/**
 * About `pages` Letter pages of prose with `notes` footnotes spread through it. Each note starts with a marker
 * ("Q7Q") that tells which note a page shows; every fifth note is long.
 */
export function notesDocument(pages: number, notes: number): unknown {
  const paras = pages * 10;
  const every = Math.max(1, Math.floor(paras / notes));
  const content: unknown[] = [];
  const box: unknown[] = [];
  for (let i = 0; i < paras; i++) {
    if (i % 30 === 0) content.push(h(1, `Part ${i / 30 + 1}`, `part-${i / 30 + 1}`));
    const k = i / every + 1;
    if (i % every === 0 && k <= notes) {
      const id = `fn${k}`;
      content.push({ type: "paragraph", content: [text(prose(40, i)), { type: "noteRef", attrs: { id, kind: "footnote" } }, text(` ${prose(30, i + 1)}`)] });
      box.push({ type: "note", attrs: { id, kind: "footnote" }, content: [p(`Q${k}Q ${prose(k % 5 === 0 ? 120 : 15 + (k % 4) * 10, k)}`)] });
    } else content.push(p(prose(70, i)));
  }
  if (box.length) content.push({ type: "notes", attrs: { footFormat: "decimal", endFormat: "lowerRoman" }, content: box });
  return { type: "doc", content };
}

/** A plain SVG image of the given size and colour, as a data URL (documents from before stage 7 had these). */
export function svgImage(w: number, h: number, fill = "#4a7bd0"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${fill}"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="#f2c14e"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export const imageNode = (src: string, attrs: Record<string, unknown> = {}) => ({ type: "image", attrs: { src, alt: "A test image", ...attrs } });

/**
 * About eight Letter pages with images wrapped left and right among the paragraphs, in-line images,
 * and tall wrapped images placed where they don't fit the page they would start on (A9).
 */
export function imageDocument(): unknown {
  const content: unknown[] = [{ type: "paragraph", attrs: { textStyle: "title" }, content: [text("Images fixture")] }];
  for (let s = 1; s <= 8; s++) {
    content.push(h(2, `Section ${s}`, `img-sec-${s}`));
    for (let i = 0; i < 5; i++) {
      if (i === 1) content.push(imageNode(svgImage(320, 240), { width: 240, naturalWidth: 320, naturalHeight: 240, wrap: s % 2 ? "left" : "right" }));
      if (i === 3 && s % 3 === 0) content.push(imageNode(svgImage(600, 300, "#3c9a6b"), { naturalWidth: 600, naturalHeight: 300 }));
      if (i === 4 && s % 2 === 0) content.push(imageNode(svgImage(300, 600, "#b5534a"), { width: 200, naturalWidth: 300, naturalHeight: 600, wrap: "right" }));
      content.push(p(prose(40 + ((s + i) % 4) * 15, s * 10 + i)));
    }
  }
  content.push(p("The end."));
  return { type: "doc", content };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A real PNG file: a colour fading across, or noise (which barely compresses, for large files). */
export function png(w: number, h: number, rgb: [number, number, number], noise = false): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = w * 3 + 1;
  const raw = noise ? randomBytes(row * h) : Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    raw[y * row] = 0;
    if (noise) continue;
    for (let x = 0; x < w; x++) {
      const o = y * row + 1 + x * 3;
      const f = 0.5 + (0.5 * x) / w;
      raw[o] = Math.round(rgb[0] * f);
      raw[o + 1] = Math.round(rgb[1] * f);
      raw[o + 2] = Math.round(rgb[2] * f);
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: noise ? 0 : 6 })), chunk("IEND", Buffer.alloc(0))]);
}

/** One file's text from a zip (a .docx): read through the central directory, stored or deflated. */
export function zipText(zip: Buffer, name: string): string {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = zip.readUInt32LE(end + 16);
  for (let i = zip.readUInt16LE(end + 10); i > 0; i--) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLen = zip.readUInt16LE(at + 28);
    const skip = nameLen + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    if (zip.toString("utf8", at + 46, at + 46 + nameLen) === name) {
      const data = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const raw = zip.subarray(data, data + size);
      return (method === 8 ? inflateRawSync(raw) : raw).toString("utf8");
    }
    at += 46 + skip;
  }
  throw new Error(`${name} is not in the zip`);
}
