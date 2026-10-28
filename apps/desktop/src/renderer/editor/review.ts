/** The text a new comment is about, highlighted while its card is open: a decoration that follows edits. */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface DraftRange {
  from: number;
  to: number;
}

export const draftKey = new PluginKey<DraftRange | null>("pdoc-comment-draft");

export const CommentDraft = Extension.create({
  name: "commentDraft",
  addProseMirrorPlugins() {
    return [
      new Plugin<DraftRange | null>({
        key: draftKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const set = tr.getMeta(draftKey) as DraftRange | null | undefined;
            if (set !== undefined) return set;
            if (!value || !tr.docChanged) return value;
            const from = tr.mapping.map(value.from, 1);
            const to = tr.mapping.map(value.to, -1);
            return to > from ? { from, to } : null;
          },
        },
        props: {
          decorations(state) {
            const d = draftKey.getState(state);
            return d ? DecorationSet.create(state.doc, [Decoration.inline(d.from, d.to, { class: "pd-comment-draft" })]) : null;
          },
        },
      }),
    ];
  },
});
