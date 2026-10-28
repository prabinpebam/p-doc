/**
 * Files in and out (U17, U18): a document as Word, Markdown, a web page or plain text, and a new
 * document from one of those files. Electron-free, so the window and the `pdoc` CLI share it.
 */
import type { JSONContent } from "@tiptap/core";
import { cleanPage, fromHTML, fromMarkdown, fromText, importKind, parseDocument, titleFromFile, toHTML, toMarkdown, toText, type PageSetup, type PDocFile } from "@p-doc/core";
import { fromDocx, toDocx } from "@p-doc/core/docx";
import type { ExportKind, Imported } from "../shared/api.ts";
import type { Library } from "./library.ts";

/** The largest file Open from file accepts. */
export const MAX_IMPORT = 50 * 1024 * 1024;

export const EXPORTS: Record<ExportKind, { ext: string; label: string }> = {
  docx: { ext: "docx", label: "Word document" },
  md: { ext: "md", label: "Markdown" },
  html: { ext: "html", label: "Web page" },
  txt: { ext: "txt", label: "Plain text" },
};

export const isExportKind = (k: unknown): k is ExportKind => typeof k === "string" && Object.hasOwn(EXPORTS, k);

export class ImportError extends Error {}

/** The file's bytes for a format. Exports carry the text as it reads with suggestions accepted; Word keeps them as tracked changes. */
export async function exportBytes(doc: PDocFile, kind: ExportKind): Promise<Uint8Array> {
  const utf8 = (s: string) => new TextEncoder().encode(s);
  switch (kind) {
    case "docx":
      return toDocx(doc);
    case "md":
      return utf8(toMarkdown(doc));
    case "html":
      return utf8(toHTML(doc));
    case "txt":
      return utf8(toText(doc));
  }
}

export type FromFile = { kind: "pdoc"; doc: PDocFile; leftOut: string[] } | { kind: "content"; title: string; content: JSONContent; leftOut: string[] };

const text = (data: Uint8Array) => new TextDecoder("utf-8").decode(data).replace(/^\uFEFF/, "");

/** Sentences for parts of a Word file that didn't come in, from mammoth's warnings. */
function leftOutOf(warnings: string[]): string[] {
  const parts = new Set<string>();
  for (const w of warnings) {
    if (/text ?box|textbox|wps:|v:shape|drawing/i.test(w)) parts.add("text boxes");
    else if (/object|ole|embed/i.test(w)) parts.add("embedded objects");
    else if (/image|picture/i.test(w)) parts.add("some images");
  }
  return [...parts];
}

/** What a file becomes in the library. Throws ImportError with a sentence to show. */
export async function readFile(name: string, data: Uint8Array): Promise<FromFile> {
  const kind = importKind(name);
  if (!kind) throw new ImportError("P-Doc can open .docx, .md, .html, .txt and .pdoc.json files.");
  if (data.byteLength > MAX_IMPORT) throw new ImportError("This file is larger than 50 MB.");
  const title = titleFromFile(name);
  try {
    switch (kind) {
      case "pdoc":
        return { kind: "pdoc", doc: parseDocument(text(data)), leftOut: [] };
      case "docx": {
        const r = await fromDocx(data);
        return { kind: "content", title, content: r.content, leftOut: leftOutOf(r.warnings) };
      }
      case "md":
        return { kind: "content", title, content: fromMarkdown(text(data)), leftOut: [] };
      case "html":
        return { kind: "content", title, content: fromHTML(text(data)), leftOut: [] };
      case "txt":
        return { kind: "content", title, content: fromText(text(data)), leftOut: [] };
    }
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError(kind === "docx" ? "This file isn't a Word document P-Doc can read." : `P-Doc couldn't read this file: ${(e as Error).message}`);
  }
}

/** A new private document made from a file: a .pdoc.json comes in whole, anything else as its content. */
export async function importInto(library: Library, name: string, data: Uint8Array, page?: PageSetup | null): Promise<Imported> {
  const f = await readFile(name, data);
  await library.ensure();
  const opened = f.kind === "pdoc" ? await library.adopt(f.doc) : await library.create({ title: f.title, space: "private", content: f.content, page: page ? cleanPage(page) : undefined });
  return { opened, leftOut: f.leftOut };
}

/** "Imported. Some parts (text boxes, embedded objects) were left out." */
export function leftOutMessage(leftOut: string[]): string | null {
  return leftOut.length ? `Imported. Some parts (${leftOut.join(", ")}) were left out.` : null;
}
