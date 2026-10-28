/** Tools > Compare documents… (U66, spec §4.5 step 4): a new private document of suggestions. */
import { compareDocuments, comparisonTitle, listChanges, type PDocFile } from "@p-doc/core";
import type { JSONContent } from "@tiptap/core";
import type { DocRef } from "../shared/api.ts";
import { setMarkup } from "./review.ts";
import { flush, ipcMessage, newDoc, snapshot } from "./session.ts";
import { dismissToast, toast } from "./state.ts";

/** One side of a comparison: the open document, a library document, or a file already read. */
export type CompareSide = { kind: "this" } | { kind: "doc"; ref: DocRef } | { kind: "file"; title: string; content: PDocFile["content"] };

export const COMPARISON_AUTHOR = "Comparison";

async function read(side: CompareSide): Promise<{ title: string; content: JSONContent; page?: PDocFile["page"] }> {
  if (side.kind === "file") return { title: side.title, content: side.content };
  if (side.kind === "this") {
    const d = snapshot();
    if (!d) throw new Error("No document is open");
    return { title: d.title, content: d.content, page: d.page };
  }
  const o = await window.pdoc.library.read(side.ref);
  return { title: o.doc.title, content: o.doc.content, page: o.doc.page };
}

let busy = false;

/** Makes "Comparison of A and B" (B with every difference from A as a suggestion) and opens it in All markup. */
export async function compareInto(original: CompareSide, revised: CompareSide): Promise<boolean> {
  if (busy) return false;
  busy = true;
  const working = toast("Comparing…");
  try {
    await flush();
    const [a, b] = await Promise.all([read(original), read(revised)]);
    // Let "Comparing…" paint before the work.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const content = compareDocuments(a.content, b.content, { author: COMPARISON_AUTHOR, time: new Date().toISOString() });
    const n = listChanges(content).length;
    await newDoc({ title: comparisonTitle(a.title, b.title), space: "private", content, page: b.page ?? a.page });
    setMarkup("all");
    dismissToast(working);
    toast(n === 0 ? "No differences: the two documents are the same." : n === 1 ? "Compared: 1 difference." : `Compared: ${n.toLocaleString()} differences.`);
    return true;
  } catch (e) {
    dismissToast(working);
    toast(`Couldn't compare: ${ipcMessage(e)}`, { tone: "error" });
    return false;
  } finally {
    busy = false;
  }
}
