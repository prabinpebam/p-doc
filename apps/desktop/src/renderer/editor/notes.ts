/**
 * Footnotes and endnotes in the editor (U51): Insert > Footnote (Ctrl+Alt+F) and Endnote (Ctrl+Alt+D)
 * put a number at the cursor and the caret in its note; Esc or Shift+Tab in a note goes back to its
 * number, and double-clicking a number goes to its note; a note converts between footnote and endnote. The notes are kept in step by NotesSync (core).
 */
import { Extension, type Editor } from "@tiptap/core";
import { NodeSelection, Plugin, Selection, TextSelection, type EditorState } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { DEFAULT_FORMATS, newNoteId, notesOf, refsOf, type NoteFormat, type NoteKind } from "@p-doc/core";
import { schedule } from "./pages.ts";

/** The end of the text, before the notes (Ctrl+End, a click below the text). */
export function textEnd(state: EditorState): Selection {
  const box = notesOf(state.doc);
  return box ? Selection.near(state.doc.resolve(box.pos), -1) : Selection.atEnd(state.doc);
}

/** The note the selection is in or on: its id, kind and the position of its number. */
export function noteAt(state: EditorState): { id: string; kind: NoteKind; ref: number } | null {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.type.name === "noteRef") return { id: String(sel.node.attrs.id), kind: sel.node.attrs.kind, ref: sel.from };
  const $h = sel.$head;
  for (let d = $h.depth; d > 0; d--) {
    const n = $h.node(d);
    if (n.type.name === "note") {
      const id = String(n.attrs.id);
      const r = refsOf(state.doc).find((x) => x.id === id);
      return r ? { id, kind: r.kind, ref: r.pos } : null;
    }
  }
  return null;
}

/** Puts the caret at the end of a note's text and shows it once the pages are laid out. */
function enterNote(editor: Editor, id: string): void {
  const { state, view } = editor;
  const box = notesOf(state.doc);
  if (!box) return;
  box.node.forEach((n, off) => {
    if (String(n.attrs.id) !== id) return;
    const end = box.pos + 1 + off + n.nodeSize - 1;
    view.dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(end), -1)).scrollIntoView());
  });
  view.focus();
  // The note moves to the foot of its page when the pages are laid out: show it there.
  schedule();
  requestAnimationFrame(() => requestAnimationFrame(() => !view.isDestroyed && view.dispatch(view.state.tr.scrollIntoView())));
}

export function insertNote(editor: Editor, kind: NoteKind): void {
  const { state, view } = editor;
  const type = state.schema.nodes.noteRef!;
  const id = newNoteId();
  // As in Word, the number goes after a selection, not in place of it.
  const at = state.selection.to;
  const box = notesOf(state.doc);
  // Not in a note (Word has no notes in notes), and only where text goes.
  if (!state.doc.resolve(at).parent.inlineContent || (box && at >= box.pos)) return;
  view.dispatch(state.tr.insert(at, type.create({ id, kind })));
  enterNote(editor, id);
}

/** Back to a note's number, the caret just after it (Esc or Shift+Tab in a note, Word's "go to reference"). */
export function backToRef(editor: Editor): boolean {
  const n = noteAt(editor.state);
  if (!n || editor.state.selection instanceof NodeSelection) return false;
  const { view } = editor;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, n.ref + 1)).scrollIntoView());
  return true;
}

/** Converts the note at the selection between footnote and endnote. */
export function convertNote(editor: Editor): void {
  const n = noteAt(editor.state);
  if (!n) return;
  const { view } = editor;
  view.dispatch(view.state.tr.setNodeMarkup(n.ref, undefined, { id: n.id, kind: n.kind === "footnote" ? "endnote" : "footnote" }));
  schedule();
}

export interface NoteOptions {
  footFormat: NoteFormat;
  endFormat: NoteFormat;
  /** Turn every note of the other kind into this kind. */
  convert: NoteKind | null;
}

export function noteOptions(state: EditorState): NoteOptions {
  const box = notesOf(state.doc);
  return { footFormat: box?.node.attrs.footFormat ?? DEFAULT_FORMATS.footnote, endFormat: box?.node.attrs.endFormat ?? DEFAULT_FORMATS.endnote, convert: null };
}

/** Format > Notes…: number formats and converting every note, as one step to undo. */
export function applyNoteOptions(editor: Editor, o: NoteOptions): void {
  const { view } = editor;
  const tr = view.state.tr;
  const box = notesOf(view.state.doc);
  if (box && (box.node.attrs.footFormat !== o.footFormat || box.node.attrs.endFormat !== o.endFormat))
    tr.setNodeMarkup(box.pos, undefined, { ...box.node.attrs, footFormat: o.footFormat, endFormat: o.endFormat });
  if (o.convert) for (const r of refsOf(view.state.doc)) if (r.kind !== o.convert) tr.setNodeMarkup(r.pos, undefined, { id: r.id, kind: o.convert });
  if (tr.docChanged) view.dispatch(closeHistory(tr));
  schedule();
}

export const hasNotes = (state: EditorState) => !!notesOf(state.doc);

export const NotesKeys = Extension.create({
  name: "notesKeys",
  // Before tabs and lists, which also take Shift+Tab.
  priority: 200,
  addKeyboardShortcuts() {
    return {
      Escape: () => backToRef(this.editor),
      "Shift-Tab": () => backToRef(this.editor),
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          // Double-click a note reference to go to its note (as in Word).
          handleDoubleClickOn: (_view, _pos, node) => {
            if (node.type.name !== "noteRef") return false;
            enterNote(editor, String(node.attrs.id));
            return true;
          },
        },
      }),
    ];
  },
});
