/** Section edits in the live editor (U55): which section the cursor is in, and its page geometry. */
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { sectionIndexAt, sectionPageOf, sectionsOf, type PageSetup, type Section, type SectionPage, type SectionStart } from "@p-doc/core";

/** The document's sections and the index of the one the cursor is in. */
export function sectionAtCursor(state: EditorState, base: PageSetup): { sections: Section[]; index: number } {
  const sections = sectionsOf(state.doc, base);
  return { sections, index: sectionIndexAt(sections, state.selection.$from.index(0)) };
}

/** The document position of each top-level block. */
function offsets(state: EditorState): number[] {
  const out: number[] = [];
  state.doc.forEach((_n, off) => void out.push(off));
  return out;
}

/** Gives the break that starts section `k` its own geometry, so a change before it leaves it as it is. */
function pin(tr: Transaction, sections: Section[], k: number, at: number[]): void {
  const s = sections[k];
  if (s?.breakAt == null) return;
  const pos = at[s.breakAt]!;
  const node = tr.doc.nodeAt(pos);
  if (node && !node.attrs.page) tr.setNodeMarkup(pos, undefined, { ...node.attrs, page: sectionPageOf(s.page) });
}

/**
 * Sets section `k`'s paper, orientation and margins (k > 0: on its break; the first section's are the
 * document's, set by the caller). The section after keeps its own. `start` changes how the section starts.
 */
export function setSectionPage(editor: Editor, sections: Section[], k: number, page: SectionPage, start?: SectionStart): void {
  const s0 = sections[k];
  if (!s0 || (JSON.stringify(sectionPageOf(s0.page)) === JSON.stringify(page) && !start)) return;
  const at = offsets(editor.state);
  // A dialog's change is one Undo step of its own.
  const tr = closeHistory(editor.state.tr);
  pin(tr, sections, k + 1, at);
  const s = sections[k]!;
  if (s.breakAt != null) {
    const pos = at[s.breakAt]!;
    const node = tr.doc.nodeAt(pos)!;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, page, ...(start ? { kind: start } : {}) });
  }
  if (tr.docChanged) editor.view.dispatch(tr);
}

/** Whole document: every section takes the document's geometry again. */
export function clearSectionPages(editor: Editor): void {
  const tr = closeHistory(editor.state.tr);
  editor.state.doc.forEach((n, off) => {
    if (n.type.name === "sectionBreak" && n.attrs.page) tr.setNodeMarkup(off, undefined, { ...n.attrs, page: null });
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}
