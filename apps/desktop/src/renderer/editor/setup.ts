/** The live editor's extensions: the shared schema plus placeholder, TOC sync, suggestions, find and image files. */
import { commands, Extension, type AnyExtension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Placeholder, TrailingNode } from "@tiptap/extensions";
import { extensions, Suggest, TocSync } from "@p-doc/core";
import { FindHighlight } from "./find.ts";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Inserts image files at a position (or the selection); files over 2 MB are refused through `onTooLarge`. */
export async function insertImageFiles(view: EditorView, files: File[], at: number | null, onTooLarge: () => void): Promise<void> {
  for (const f of files) {
    if (f.size > MAX_IMAGE_BYTES) {
      onTooLarge();
      continue;
    }
    const src = await readImage(f);
    const node = view.state.schema.nodes.image!.create({ src, alt: f.name.replace(/\.[^.]+$/, "") });
    const tr = at == null ? view.state.tr.replaceSelectionWith(node) : view.state.tr.insert(at, node);
    view.dispatch(tr.scrollIntoView());
  }
}

const imagesOf = (list: FileList | null | undefined) => [...(list ?? [])].filter((f) => f.type.startsWith("image/"));

function ImageFiles(onTooLarge: () => void) {
  return Extension.create({
    name: "imageFiles",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            handlePaste(view, event) {
              const files = imagesOf(event.clipboardData?.files);
              if (!files.length) return false;
              void insertImageFiles(view, files, null, onTooLarge);
              return true;
            },
            handleDrop(view, event) {
              const files = imagesOf(event.dataTransfer?.files);
              if (!files.length) return false;
              const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null;
              void insertImageFiles(view, files, at, onTooLarge);
              return true;
            },
          },
        }),
      ];
    },
  });
}

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

export function editorExtensions(o: { author: string; onImageTooLarge: () => void }): AnyExtension[] {
  return extensions({
    extra: [
      SyncFocus,
      // As in Word and Google Docs, a table, rule, break, image or code block is never the last block.
      TrailingNode.configure({ node: "paragraph", notAfter: ["paragraph", "heading", "blockquote", "bulletList", "orderedList", "taskList"] }),
      Placeholder.configure({ placeholder: "Start writing" }),
      TocSync,
      Suggest.configure({ author: o.author }),
      FindHighlight,
      ImageFiles(o.onImageTooLarge),
    ],
  });
}
