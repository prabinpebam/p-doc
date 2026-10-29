/** Paragraph style definitions in the editor's history, without duplicating them in the document content. */
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Step, StepResult } from "@tiptap/pm/transform";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as PMNode } from "@tiptap/pm/model";
import { followingStyle, SKIP_META, styleKeyOf, type Styles } from "@p-doc/core";

/** A history step changes the styles plugin's state, not the content tree. */
export class StylesStep extends Step {
  constructor(readonly before: Styles, readonly after: Styles) { super(); }
  apply(doc: PMNode) { return StepResult.ok(doc); }
  invert() { return new StylesStep(this.after, this.before); }
  map() { return this; }
  toJSON() { return { stepType: "pdocStyles", before: this.before, after: this.after }; }
  static override fromJSON(_schema: unknown, json: { before: Styles; after: Styles }) { return new StylesStep(json.before, json.after); }
}
Step.jsonID("pdocStyles", StylesStep);

export const documentStyles = new PluginKey<Styles>("pdocStyles");

export const StyleHistory = Extension.create<{ styles: Styles }>({
  name: "styleHistory",
  addProseMirrorPlugins() {
    const styles = this.options.styles;
    return [new Plugin<Styles>({
      key: documentStyles,
      state: {
        init: () => styles,
        apply: (tr, value) => {
          for (const step of tr.steps) if (step instanceof StylesStep) value = step.after;
          return value;
        },
      },
    })];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty || !$from.parent.isTextblock || $from.parentOffset !== $from.parent.content.size) return false;
        const key = styleKeyOf($from.parent.type.name, $from.parent.attrs);
        const styles = documentStyles.getState(state);
        if (!key || !styles || key === "code") return false;
        const next = followingStyle(key, styles);
        if (next === key && !key.startsWith("custom-")) return false;
        return this.editor.chain().splitBlock().command(({ tr }) => {
          const pos = tr.selection.$from.before();
          const node = tr.selection.$from.parent;
          const heading = next.startsWith("heading");
          tr.setNodeMarkup(pos, heading ? state.schema.nodes.heading : state.schema.nodes.paragraph, {
            ...node.attrs, id: null, level: heading ? Number(next.slice(7)) : undefined,
            textStyle: heading || next === "normal" ? null : next,
          });
          return true;
        }).run();
      },
    };
  },
});

/** A style edit (and deleted-style fallback) is one independent Undo/Redo step. */
export function setDocumentStyles(editor: Editor, styles: Styles, deleted?: string): void {
  const before = documentStyles.getState(editor.state);
  if (!before || JSON.stringify(before) === JSON.stringify(styles)) return;
  const tr = closeHistory(editor.state.tr);
  if (deleted) tr.doc.descendants((node, pos) => {
    if (node.type.name === "paragraph" && node.attrs.textStyle === deleted) tr.setNodeMarkup(pos, undefined, { ...node.attrs, textStyle: null });
  });
  tr.step(new StylesStep(before, styles));
  // Style definitions are document settings, not text: never a suggestion, even while Suggesting.
  tr.setMeta(SKIP_META, true);
  editor.view.dispatch(tr);
  editor.view.dispatch(closeHistory(editor.state.tr));
}
