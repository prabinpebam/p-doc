/**
 * Bookmarks and links inside the document in the editor (U52): Insert > Bookmark… names the caret's place,
 * and Ctrl+click on a "#…" link goes to its heading or bookmark.
 */
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, TextSelection, type EditorState } from "@tiptap/pm/state";
import { anchorsOf, bookmarkName, newBookmarkId, tocEntriesOf } from "@p-doc/core";

/** The selected bookmark, when there is one. */
export function bookmarkAt(state: EditorState): { pos: number; name: string } | null {
  const sel = state.selection;
  return sel instanceof NodeSelection && sel.node.type.name === "bookmark" ? { pos: sel.from, name: String(sel.node.attrs.name) } : null;
}

/** A new bookmark's first name: the words after the caret, or before it at the end of a paragraph. */
export function suggestedBookmarkName(state: EditorState): string {
  const { $from } = state.selection;
  const p = $from.parent;
  return bookmarkName(p.textBetween($from.parentOffset, p.content.size, " ", " "), p.textBetween(0, $from.parentOffset, " ", " "));
}

/** Renames the selected bookmark, or puts a new one at the start of the selection: one step to undo. */
export function setBookmark(editor: Editor, name: string): void {
  const { view } = editor;
  const { state } = view;
  const at = bookmarkAt(state);
  if (at) view.dispatch(closeHistory(state.tr.setNodeMarkup(at.pos, undefined, { ...state.doc.nodeAt(at.pos)!.attrs, name })));
  else {
    const pos = state.selection.from;
    if (!state.doc.resolve(pos).parent.inlineContent) return;
    const tr = state.tr.insert(pos, state.schema.nodes.bookmark!.create({ id: newBookmarkId(), name }));
    view.dispatch(closeHistory(tr.setSelection(TextSelection.create(tr.doc, pos + 1))));
  }
  view.focus();
}

export function removeBookmark(editor: Editor): void {
  const at = bookmarkAt(editor.state);
  if (!at) return;
  editor.view.dispatch(closeHistory(editor.state.tr.delete(at.pos, at.pos + 1)));
  editor.view.focus();
}

/** Goes to a heading or bookmark by id: the caret at it, the place in view. False when it is not there. */
export function followAnchor(editor: Editor, id: string): boolean {
  const { view } = editor;
  const a = anchorsOf(view.state.doc).find((x) => x.id === id);
  if (!a || a.pos === undefined) return false;
  const doc = view.state.doc;
  const sel = a.kind === "heading" ? TextSelection.near(doc.resolve(a.pos + 1)) : TextSelection.create(doc, a.pos + 1);
  view.dispatch(view.state.tr.setSelection(sel));
  view.focus();
  const { node } = view.domAtPos(sel.from);
  const el = node instanceof HTMLElement ? node : node.parentElement;
  el?.closest("p, h1, h2, h3, h4, h5, h6, li, td, th")?.scrollIntoView({ block: "center" });
  return true;
}

export type ContentsShow = "pages" | "links";

/** The contents Contents options apply to: the selected one, else the last one before the caret, else the first. */
export function contentsAt(state: EditorState): { pos: number; levels: number; show: ContentsShow } | null {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.type.name === "tableOfContents") return { pos: sel.from, levels: Number(sel.node.attrs.levels), show: sel.node.attrs.show };
  let found: { pos: number; levels: number; show: ContentsShow } | null = null;
  state.doc.forEach((n, pos) => {
    if (n.type.name !== "tableOfContents") return;
    if (!found || pos <= sel.from) found = { pos, levels: Number(n.attrs.levels), show: n.attrs.show };
  });
  return found;
}

/** Sets a contents' levels and what it shows, its entries with them: one step to undo. */
export function setContentsOptions(editor: Editor, levels: number, show: ContentsShow): void {
  const at = contentsAt(editor.state);
  if (!at) return;
  const { view } = editor;
  const node = view.state.doc.nodeAt(at.pos)!;
  const entries = tocEntriesOf(view.state.doc, levels);
  view.dispatch(closeHistory(view.state.tr.setNodeMarkup(at.pos, undefined, { ...node.attrs, levels, show, entries })));
  view.focus();
}
