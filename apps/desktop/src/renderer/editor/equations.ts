/**
 * Equations in the editor (U62, spec §4.14 step 5): drawn as MathML from their LaTeX; a click on one, or
 * Insert > Equation (Alt+=), opens the Equation dialog. On an empty line it is a display equation.
 */
import { Extension, InputRule, type Editor } from "@tiptap/core";
import { NodeSelection, Plugin, type EditorState } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorView, NodeView } from "@tiptap/pm/view";
import { mathmlOrSource } from "@p-doc/core";
import { openDialog } from "../state.ts";

/** The equation the Equation dialog edits: the selected one (pos ≥ 0), or a new one at the caret. */
export interface EquationTarget {
  pos: number;
  latex: string;
  display: boolean;
}

const isMath = (n: PMNode | null | undefined) => n?.type.name === "mathInline" || n?.type.name === "mathBlock";

export function equationAt(state: EditorState): EquationTarget {
  const sel = state.selection;
  if (sel instanceof NodeSelection && isMath(sel.node)) return { pos: sel.from, latex: String(sel.node.attrs.latex), display: sel.node.type.name === "mathBlock" };
  const { $from } = sel;
  // On an empty line of its own, an equation is a display equation.
  const display = sel.empty && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0 && $from.depth >= 1;
  return { pos: -1, latex: "", display };
}

/** Puts `latex` in the target equation, or inserts a new one at the caret; an empty one removes it. */
export function applyEquation(editor: Editor, target: EquationTarget, latex: string): void {
  const { state, view } = editor;
  const tr = state.tr;
  const schema = state.schema;
  if (target.pos >= 0) {
    const node = state.doc.nodeAt(target.pos);
    if (!isMath(node)) return;
    if (!latex) tr.delete(target.pos, target.pos + node!.nodeSize);
    else tr.setNodeMarkup(target.pos, undefined, { ...node!.attrs, latex }).setSelection(NodeSelection.create(tr.doc, target.pos));
  } else {
    if (!latex) return void editor.commands.focus();
    if (target.display) {
      const { $from } = state.selection;
      const at = $from.before();
      tr.replaceWith(at, $from.after(), schema.nodes.mathBlock!.create({ latex }));
      tr.setSelection(NodeSelection.create(tr.doc, at));
    } else {
      tr.replaceSelectionWith(schema.nodes.mathInline!.create({ latex }), false);
    }
  }
  view.dispatch(tr.scrollIntoView());
  editor.commands.focus();
}

function mathView(node: PMNode, view: EditorView, getPos: () => number | undefined): NodeView {
  const display = node.type.name === "mathBlock";
  const dom = document.createElement(display ? "div" : "span");
  dom.className = display ? "pd-math-block" : "pd-math";
  dom.dataset.type = display ? "math-block" : "math-inline";
  dom.contentEditable = "false";
  let latex: string | null = null;
  const draw = (n: PMNode) => {
    if (n.attrs.latex === latex) return;
    latex = String(n.attrs.latex);
    dom.dataset.latex = latex;
    dom.innerHTML = mathmlOrSource(latex, display);
  };
  draw(node);
  // A click edits it again (the mouse down has selected it).
  dom.addEventListener("click", () => {
    const pos = getPos();
    if (!view.editable || pos == null) return;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    openDialog({ kind: "equation" });
  });
  return {
    dom,
    update: (n) => {
      if (n.type !== node.type) return false;
      draw(n);
      return true;
    },
    ignoreMutation: () => true,
  };
}

export const Equations = Extension.create({
  name: "equations",
  addProseMirrorPlugins() {
    return [new Plugin({ props: { nodeViews: { mathInline: mathView, mathBlock: mathView } } })];
  },
  addInputRules() {
    // `$x^2$` typed makes an inline equation; a `$` after a letter, a digit or a backslash is a dollar sign.
    const type = this.editor.schema.nodes.mathInline!;
    return [
      new InputRule({
        find: /(?:^|[^\\$\w])(\$([^$\s](?:[^$]*[^$\s\\])?)\$)$/,
        handler: ({ state, range, match }) => {
          const from = range.from + match[0].length - match[1]!.length;
          state.tr.replaceWith(from, range.to, type.create({ latex: match[2] }));
        },
      }),
    ];
  },
});
