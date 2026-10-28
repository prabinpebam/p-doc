/**
 * Images (U39, U40): stored once beside the document as `assets/<sha256>.<ext>` in its repository
 * (O15), referred to by that path relative to the repository root, and laid out by their own
 * attributes (size, alignment, wrap, crop). Pure: used by the editor, main, exports and the CLI.
 */
import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";

/** The largest image P-Doc takes in (spec §4.9). */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export const IMAGE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
};
export const IMAGE_MIME: Record<string, string> = Object.fromEntries(Object.entries(IMAGE_EXT).map(([m, e]) => [e, m]));

/** An image's path in its repository. */
export const ASSET_SRC = /^assets\/([0-9a-f]{64})\.(png|jpg|gif|webp|svg|bmp)$/;
export const isAssetSrc = (s: unknown): s is string => typeof s === "string" && ASSET_SRC.test(s);
export const isDataImage = (s: unknown): s is string => typeof s === "string" && /^data:image\/[a-z0-9.+-]+;base64,/i.test(s);

/** The scheme the window loads images through (main serves only `assets/` files). */
export const ASSET_SCHEME = "pdoc-asset";
export const assetUrl = (src: string) => `${ASSET_SCHEME}://a/${src.slice("assets/".length)}`;
/** The asset path an asset URL stands for, or null. */
export function assetOfUrl(url: string): string | null {
  const m = /^pdoc-asset:\/\/a\/([0-9a-f]{64}\.(?:png|jpg|gif|webp|svg|bmp))$/.exec(url);
  return m ? `assets/${m[1]}` : null;
}

/** The bytes and type of a base64 data URL image. */
export function dataImageParts(src: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(src);
  if (!m) return null;
  const mime = m[1]!.toLowerCase();
  if (!IMAGE_EXT[mime]) return null;
  const bin = atob(m[2]!.replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime, bytes };
}

export function dataImageUrl(mime: string, bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

export type ImageType = "png" | "jpg" | "gif" | "bmp" | "webp" | "svg";

/** Width, height and type from an image's bytes (PNG, JPEG, GIF, BMP, WebP, SVG). */
export function imageInfo(buf: Uint8Array): { width: number; height: number; type: ImageType } | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const ascii = (at: number, n: number) => String.fromCharCode(...buf.subarray(at, at + n));
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) return { width: dv.getUint32(16), height: dv.getUint32(20), type: "png" };
  if (buf.length > 10 && buf[0] === 0x47 && buf[1] === 0x49) return { width: dv.getUint16(6, true), height: dv.getUint16(8, true), type: "gif" };
  if (buf.length > 26 && buf[0] === 0x42 && buf[1] === 0x4d) return { width: dv.getInt32(18, true), height: Math.abs(dv.getInt32(22, true)), type: "bmp" };
  if (buf.length > 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const kind = ascii(12, 4);
    if (kind === "VP8X") return { width: 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16)), height: 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16)), type: "webp" };
    if (kind === "VP8 ") return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff, type: "webp" };
    if (kind === "VP8L") {
      const b = dv.getUint32(21, true);
      return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff), type: "webp" };
    }
    return null;
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1]!;
      const len = dv.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: dv.getUint16(i + 7), height: dv.getUint16(i + 5), type: "jpg" };
      i += 2 + len;
    }
    return null;
  }
  const head = new TextDecoder().decode(buf.subarray(0, Math.min(buf.length, 4096)));
  const svg = /<svg\b[^>]*>/i.exec(head)?.[0];
  if (svg) {
    const num = (name: string) => {
      const v = new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, "i").exec(svg);
      return v ? Number(v[1]) : null;
    };
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(svg);
    const width = num("width") ?? (vb ? Number(vb[1]) : 300);
    const height = num("height") ?? (vb ? Number(vb[2]) : 150);
    return { width: Math.round(width), height: Math.round(height), type: "svg" };
  }
  return null;
}

export type ImageWrap = "inline" | "left" | "right";
export type ImageAlign = "left" | "center" | "right";
/** The part of the picture shown, as fractions of its natural size. The file is never changed. */
export interface ImageCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const WRAPS: readonly ImageWrap[] = ["inline", "left", "right"];
export const ALIGNS: readonly ImageAlign[] = ["left", "center", "right"];

export function cleanCrop(v: unknown): ImageCrop | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const f = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : NaN);
  const crop = { x: f(c.x), y: f(c.y), w: f(c.w), h: f(c.h) };
  if (Object.values(crop).some(Number.isNaN)) return null;
  if (crop.x < 0 || crop.y < 0 || crop.w < 0.01 || crop.h < 0.01 || crop.x + crop.w > 1.0001 || crop.y + crop.h > 1.0001) return null;
  if (crop.x === 0 && crop.y === 0 && crop.w >= 0.9999 && crop.h >= 0.9999) return null;
  return crop;
}

const positive = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);

/** Every image node in content, in order. */
export function eachImage(content: JSONContent | undefined, fn: (node: JSONContent) => void): void {
  if (!content) return;
  if (content.type === "image") fn(content);
  for (const c of content.content ?? []) eachImage(c, fn);
}

/** The repository files a document's images are, once each. */
export function assetsOf(content: JSONContent | undefined): string[] {
  const out = new Set<string>();
  eachImage(content, (n) => {
    if (isAssetSrc(n.attrs?.src)) out.add(n.attrs!.src as string);
  });
  return [...out];
}

export function hasDataImages(content: JSONContent | undefined): boolean {
  let found = false;
  eachImage(content, (n) => {
    if (isDataImage(n.attrs?.src)) found = true;
  });
  return found;
}

/** A copy of content with each image's attributes passed through `fn` (unchanged when it returns null). */
export function mapImages(content: JSONContent, fn: (attrs: Record<string, unknown>) => Record<string, unknown> | null): JSONContent {
  const walk = (n: JSONContent): JSONContent => {
    let out = n;
    if (n.type === "image") {
      const next = fn({ ...(n.attrs ?? {}) });
      if (next) out = { ...n, attrs: next };
    }
    if (n.content) out = { ...out, content: n.content.map(walk) };
    return out;
  };
  return walk(content);
}

/** The frame and picture of a laid-out image, as inline styles that need no stylesheet. */
export function imageStyles(attrs: Record<string, unknown>): { outer: string; frame: string; img: string } {
  const wrap = WRAPS.includes(attrs.wrap as ImageWrap) ? (attrs.wrap as ImageWrap) : "inline";
  const align = ALIGNS.includes(attrs.align as ImageAlign) ? (attrs.align as ImageAlign) : "center";
  const width = positive(attrs.width);
  const height = width ? positive(attrs.height) : null;
  const nw = positive(attrs.naturalWidth);
  const nh = positive(attrs.naturalHeight);
  const crop = cleanCrop(attrs.crop);
  const outer =
    wrap === "left" ? "float: left; margin: 0 16px 8px 0; max-width: 100%" : wrap === "right" ? "float: right; margin: 0 0 8px 16px; max-width: 100%" : `text-align: ${align}`;
  const frameW = width ? `width: ${width}px` : nw ? `width: ${crop ? Math.round(nw * crop.w) : nw}px` : "";
  if (height) {
    // Proportions freed (Shift while resizing): the frame has both sides and the picture stretches to it.
    const frame = `display: inline-block; position: relative; overflow: hidden; vertical-align: top; max-width: 100%; ${frameW}; height: ${height}px`;
    if (crop) {
      const pct = (v: number) => `${+v.toFixed(4)}%`;
      return {
        outer,
        frame,
        img: `position: absolute; max-width: none; width: ${pct(100 / crop.w)}; height: ${pct(100 / crop.h)}; left: ${pct((-crop.x / crop.w) * 100)}; top: ${pct((-crop.y / crop.h) * 100)}`,
      };
    }
    return { outer, frame, img: "display: block; width: 100%; height: 100%" };
  }
  if (crop && nw && nh) {
    const pct = (v: number) => `${+v.toFixed(4)}%`;
    return {
      outer,
      frame: `display: inline-block; position: relative; overflow: hidden; vertical-align: top; max-width: 100%; ${frameW}; aspect-ratio: ${+(nw * crop.w).toFixed(2)} / ${+(nh * crop.h).toFixed(2)}`,
      img: `position: absolute; max-width: none; width: ${pct(100 / crop.w)}; height: ${pct(100 / crop.h)}; left: ${pct((-crop.x / crop.w) * 100)}; top: ${pct((-crop.y / crop.h) * 100)}`,
    };
  }
  return { outer, frame: `display: inline-block; position: relative; vertical-align: top; max-width: 100%; ${frameW}`.replace(/; $/, ""), img: "display: block; width: 100%; height: auto" };
}

export interface ImageOptions {
  /** The URL an image's `src` is drawn from (the window maps asset paths to its scheme). */
  resolve: (src: string) => string;
}

const num = (el: HTMLElement, name: string) => positive(Number(el.getAttribute(name)));

/**
 * An image block (U40): `src` (an asset path, or a data URL in documents from before stage 7), alt
 * text, display width in CSS px (null: natural size up to the text width), display height (null: kept
 * in proportion; set only when a resize freed it), alignment, wrap, crop and
 * its natural size.
 */
export const PImage = Node.create<ImageOptions>({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addOptions: () => ({ resolve: (src: string) => src }),
  addAttributes: () => ({
    src: { default: null },
    alt: { default: null },
    title: { default: null },
    width: { default: null },
    height: { default: null },
    align: { default: "center" },
    wrap: { default: "inline" },
    crop: { default: null },
    naturalWidth: { default: null },
    naturalHeight: { default: null },
  }),
  parseHTML() {
    return [
      {
        tag: 'div[data-type="image"]',
        getAttrs: (el) => {
          const img = el.querySelector("img");
          if (!img) return false;
          let crop: ImageCrop | null = null;
          try {
            crop = cleanCrop(JSON.parse(el.getAttribute("data-crop") ?? "null"));
          } catch {
            crop = null;
          }
          const src = img.getAttribute("src") ?? "";
          return {
            src: assetOfUrl(src) ?? src,
            alt: img.getAttribute("alt"),
            title: img.getAttribute("title"),
            width: num(el, "data-width"),
            height: num(el, "data-height"),
            align: ALIGNS.includes(el.getAttribute("data-align") as ImageAlign) ? el.getAttribute("data-align") : "center",
            wrap: WRAPS.includes(el.getAttribute("data-wrap") as ImageWrap) ? el.getAttribute("data-wrap") : "inline",
            crop,
            naturalWidth: num(el, "data-natural-width"),
            naturalHeight: num(el, "data-natural-height"),
          };
        },
      },
      {
        tag: "img[src]",
        getAttrs: (el) => {
          const src = el.getAttribute("src") ?? "";
          return { src: assetOfUrl(src) ?? src, alt: el.getAttribute("alt"), title: el.getAttribute("title"), width: num(el, "width") };
        },
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs;
    const s = imageStyles(a);
    const crop = cleanCrop(a.crop);
    const outer = mergeAttributes(
      {
        "data-type": "image",
        class: "pd-img",
        "data-wrap": a.wrap,
        "data-align": a.align,
        style: s.outer,
      },
      a.width ? { "data-width": a.width } : {},
      a.width && a.height ? { "data-height": a.height } : {},
      crop ? { "data-crop": JSON.stringify(crop) } : {},
      a.naturalWidth ? { "data-natural-width": a.naturalWidth, "data-natural-height": a.naturalHeight } : {},
    );
    void HTMLAttributes;
    const img: Record<string, string> = { src: this.options.resolve(String(a.src ?? "")), style: s.img };
    if (a.alt) img.alt = String(a.alt);
    if (a.title) img.title = String(a.title);
    return ["div", outer, ["span", { class: "pd-img-frame", style: s.frame }, ["img", img]]];
  },
});
