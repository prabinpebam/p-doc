import { describe, expect, it } from "vitest";
import { generateHTML, generateJSON } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import {
  assetOfUrl,
  assetsOf,
  assetUrl,
  cleanCrop,
  createDocument,
  dataImageParts,
  dataImageUrl,
  declaredVersion,
  emptyContent,
  extensions,
  FORMAT_VERSION,
  hasDataImages,
  imageInfo,
  imageStyles,
  isAssetSrc,
  knownContent,
  mapImages,
  NewerFormatError,
  parseDocument,
  serializeDocument,
} from "../src/index.ts";
import { toDocx } from "../src/docx.ts";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DAwMDAAAAPAAH/X7pt6QAAAABJRU5ErkJggg==";
const SHA = "a".repeat(64);

describe("image model", () => {
  it("recognises asset paths and asset URLs, and nothing else", () => {
    expect(isAssetSrc(`assets/${SHA}.png`)).toBe(true);
    expect(isAssetSrc(`assets/../${SHA}.png`)).toBe(false);
    expect(isAssetSrc(`assets/${SHA}.exe`)).toBe(false);
    expect(assetUrl(`assets/${SHA}.jpg`)).toBe(`pdoc-asset://a/${SHA}.jpg`);
    expect(assetOfUrl(`pdoc-asset://a/${SHA}.jpg`)).toBe(`assets/${SHA}.jpg`);
    expect(assetOfUrl(`pdoc-asset://a/../x.jpg`)).toBeNull();
  });

  it("reads image sizes for every type it accepts", () => {
    const png = dataImageParts(PNG)!;
    expect(png.mime).toBe("image/png");
    expect(imageInfo(png.bytes)).toEqual({ width: 2, height: 1, type: "png" });
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30"></svg>');
    expect(imageInfo(svg)).toEqual({ width: 40, height: 30, type: "svg" });
    const webp = new Uint8Array(32);
    webp.set(new TextEncoder().encode("RIFF"), 0);
    webp.set(new TextEncoder().encode("WEBPVP8X"), 8);
    webp.set([99, 0, 0, 49, 0, 0], 24);
    expect(imageInfo(webp)).toEqual({ width: 100, height: 50, type: "webp" });
    expect(dataImageUrl(png.mime, png.bytes)).toBe(PNG);
  });

  it("keeps only crops inside the picture", () => {
    expect(cleanCrop({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 })).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
    expect(cleanCrop({ x: 0, y: 0, w: 1, h: 1 })).toBeNull();
    expect(cleanCrop({ x: 0.6, y: 0, w: 0.6, h: 1 })).toBeNull();
    expect(cleanCrop("nope")).toBeNull();
  });

  it("lists, maps and finds a document's images", () => {
    const content: JSONContent = {
      type: "doc",
      content: [
        { type: "image", attrs: { src: `assets/${SHA}.png` } },
        { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "image", attrs: { src: `assets/${SHA}.png` } }, { type: "image", attrs: { src: PNG } }] }] }] },
      ],
    };
    expect(assetsOf(content)).toEqual([`assets/${SHA}.png`]);
    expect(hasDataImages(content)).toBe(true);
    const mapped = mapImages(content, (a) => (a.src === PNG ? { ...a, src: `assets/${"b".repeat(64)}.png` } : null));
    expect(hasDataImages(mapped)).toBe(false);
    expect(assetsOf(mapped)).toHaveLength(2);
    expect(hasDataImages(content)).toBe(true);
  });

  it("round-trips size, alignment, wrap and crop through HTML, and draws assets through the resolver", () => {
    const attrs = { src: `assets/${SHA}.png`, alt: "Chart", title: null, width: 240, align: "right", wrap: "left", crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, naturalWidth: 800, naturalHeight: 400 };
    const doc: JSONContent = { type: "doc", content: [{ type: "image", attrs }] };
    const html = generateHTML(doc, extensions({ resolveImage: assetUrl }));
    expect(html).toContain(`src="pdoc-asset://a/${SHA}.png"`);
    expect(html).toContain("float: left");
    const back = generateJSON(html, extensions()) as JSONContent;
    expect(back.content![0]!.attrs).toMatchObject(attrs);
    // A plain img from elsewhere still becomes an image.
    const plain = generateJSON(`<p>x</p><img src="${PNG}" alt="red" width="120">`, extensions()) as JSONContent;
    expect(plain.content!.find((n) => n.type === "image")!.attrs).toMatchObject({ src: PNG, alt: "red", width: 120, wrap: "inline", align: "center" });
  });

  it("crops by showing part of the picture, never by changing it", () => {
    const s = imageStyles({ width: 200, crop: { x: 0.5, y: 0.25, w: 0.5, h: 0.5 }, naturalWidth: 400, naturalHeight: 200 });
    expect(s.frame).toContain("overflow: hidden");
    expect(s.frame).toContain("aspect-ratio: 200 / 100");
    expect(s.img).toContain("width: 200%");
    expect(s.img).toContain("left: -100%");
  });
});

describe("format version 2 (A18)", () => {
  it("opens a version 1 document and saves it as version 2", () => {
    const v1 = JSON.stringify({ format: "p-doc", version: 1, id: "x", title: "Old", content: { type: "doc", content: [{ type: "image", attrs: { src: PNG, alt: "red" } }] } });
    const d = parseDocument(v1);
    expect(FORMAT_VERSION).toBe(2);
    expect(d.version).toBe(2);
    expect(declaredVersion(serializeDocument(d))).toBe(2);
    expect(d.content.content![0]!.attrs!.src).toBe(PNG);
  });

  it("refuses a newer document with its title and the update message", () => {
    const v3 = JSON.stringify({ format: "p-doc", version: 3, id: "x", title: "From the future", content: { type: "doc", content: [] } });
    expect(declaredVersion(v3)).toBe(3);
    try {
      parseDocument(v3);
      throw new Error("parsed");
    } catch (e) {
      expect(e).toBeInstanceOf(NewerFormatError);
      expect((e as NewerFormatError).title).toBe("From the future");
      expect((e as Error).message).toBe("Made with a newer P-Doc. Update to edit it.");
    }
  });

  it("shows a newer document's content without the parts this build doesn't know", () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hi", marks: [{ type: "bold" }, { type: "glow" }] }, { type: "footnote", attrs: { n: 1 } }] },
        { type: "callout", content: [{ type: "paragraph", content: [{ type: "text", text: "Inside" }] }] },
      ],
    };
    const shown = knownContent(content, new Set(["doc", "paragraph", "text"]), new Set(["bold"]));
    expect(shown).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hi", marks: [{ type: "bold" }] }] },
        { type: "paragraph", content: [{ type: "text", text: "Inside" }] },
      ],
    });
    expect(knownContent({ type: "future" }, new Set(["doc"]), new Set())).toEqual(emptyContent());
  });

  it("keeps image attributes it does not know through a save", () => {
    const doc = createDocument({ title: "T", content: { type: "doc", content: [{ type: "image", attrs: { src: `assets/${SHA}.png`, futureThing: 7 } }] } });
    const again = parseDocument(serializeDocument(doc));
    expect(again.content.content![0]!.attrs).toMatchObject({ futureThing: 7 });
  });
});

describe("export-docx images (U40)", () => {
  const unzip = async (bytes: Uint8Array, name: string) => {
    const JSZip = (await import("jszip")).default;
    return (await JSZip.loadAsync(bytes)).file(name)!.async("string");
  };

  it("writes width, alignment, square wrap and crop", async () => {
    const content: JSONContent = {
      type: "doc",
      content: [
        { type: "image", attrs: { src: PNG, alt: "a", width: 96, align: "right", wrap: "inline" } },
        { type: "image", attrs: { src: PNG, alt: "b", width: 48, wrap: "left", crop: { x: 0.5, y: 0, w: 0.5, h: 1 } } },
      ],
    };
    const xml = await unzip(await toDocx(createDocument({ title: "Pics", content })), "word/document.xml");
    expect(xml).toMatch(/<w:jc w:val="right"\/>[\s\S]*?<wp:inline/);
    expect(xml).toMatch(/cx="914400" cy="457200"/);
    expect(xml).toMatch(/<wp:anchor[\s\S]*?<wp:wrapSquare[^>]*wrapText="right"/);
    expect(xml).toMatch(/<a:srcRect l="50000"/);
    expect(xml).toMatch(/cx="457200" cy="457200"/);
  });
});
