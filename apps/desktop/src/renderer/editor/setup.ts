/** The live editor's extensions: the shared schema plus placeholder, TOC sync, suggestions, find, images and pages. */
import { commands, Extension, type AnyExtension } from "@tiptap/core";
import { Selection, TextSelection } from "@tiptap/pm/state";
import { Placeholder, TrailingNode } from "@tiptap/extensions";
import { extensions, NotesSync, Suggest, TocSync } from "@p-doc/core";
import { FindHighlight } from "./find.ts";
import { ImageFiles, LiveImage, type ImageHost } from "./image.ts";
import { Pages } from "./pages.ts";
import { Tabs } from "./tabs.ts";
import { NonPrinting } from "./marks.ts";
import { CommentDraft } from "./review.ts";
import { NotesKeys, textEnd } from "./notes.ts";

/**
 * TipTap's `focus` waits a frame before focusing, so keys pressed straight after a toolbar or menu
 * action (or a popover that unmounts) land on the page. The view is focused at once instead.
 */
const SyncFocus = Extension.create({
  name: "syncFocus",
  priority: 1,
  addCommands() {
    return {
      focus:
        (position, options) =>
        (props) => {
          const ok = commands.focus(position, options)(props);
          if (ok && props.dispatch && position !== false && !props.editor.isDestroyed && !props.view.hasFocus()) props.view.focus();
          return ok;
        },
    };
  },
});

/**
 * Ctrl+Home and Ctrl+End go to the start and end of the document (Shift extends the selection), as in
 * Word. Done here because the browser's own move stops at the sheet breaks drawn between pages.
 */
const DocEnds = Extension.create({
  name: "docEnds",
  addKeyboardShortcuts() {
    const go = (end: boolean, extend: boolean) => () => {
      const { state, view } = this.editor;
      // The end of the text, not of the notes after it (in a note: the end of the notes).
      const inNotes = state.selection.$head.node(1)?.type.name === "notes";
      const target = end ? (inNotes ? Selection.atEnd(state.doc) : textEnd(state)) : Selection.atStart(state.doc);
      const sel = extend ? TextSelection.between(state.selection.$anchor, target.$head) : target;
      view.dispatch(state.tr.setSelection(sel).scrollIntoView());
      return true;
    };
    return { "Mod-Home": go(false, false), "Mod-End": go(true, false), "Mod-Shift-Home": go(false, true), "Mod-Shift-End": go(true, true) };
  },
});

export function editorExtensions(o: { author: string; images: () => ImageHost }): AnyExtension[] {
  return extensions({
    image: LiveImage,
    extra: [
      SyncFocus,
      DocEnds,
      // As in Word and Google Docs, a table, rule, break, image or code block is never the last block.
      TrailingNode.configure({ node: "paragraph", notAfter: ["paragraph", "heading", "blockquote", "bulletList", "orderedList", "taskList", "notes"] }),
      Placeholder.configure({ placeholder: "Start writing" }),
      TocSync,
      NotesSync,
      NotesKeys,
      Suggest.configure({ author: o.author }),
      CommentDraft,
      FindHighlight,
      ImageFiles(o.images),
      // Before Pages: tab widths are set before the page layout measures.
      Tabs,
      NonPrinting,
      Pages,
    ],
  });
}
