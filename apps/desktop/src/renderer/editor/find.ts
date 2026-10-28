/** Find and replace inside the editor (U10): matches per text block, highlighted by decorations. */
import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findInText, replacementFor, type FindOptions } from "@p-doc/core";

export interface DocMatch {
  from: number;
  to: number;
  groups: string[];
}

interface FindState {
  matches: DocMatch[];
  current: number;
}

export const findKey = new PluginKey<FindState>("pdoc-find");

/** A text block's text with each inline non-text node as one placeholder character, so offsets map to positions. */
function blockText(node: PMNode): string {
  let s = "";
  node.forEach((child) => {
    s += child.isText ? child.text! : "\ufffc";
  });
  return s;
}

export function findMatches(doc: PMNode, query: string, o: FindOptions): { matches: DocMatch[]; error: string | null } {
  const matches: DocMatch[] = [];
  let error: string | null = null;
  if (!query) return { matches, error };
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const r = findInText(blockText(node), query, o);
    if (r.error) error = r.error;
    for (const m of r.matches) matches.push({ from: pos + 1 + m.from, to: pos + 1 + m.to, groups: m.groups });
    return false;
  });
  return { matches, error };
}

export const FindHighlight = Extension.create({
  name: "findHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => ({ matches: [], current: -1 }),
          apply(tr, value) {
            const m = tr.getMeta(findKey) as FindState | undefined;
            if (m) return m;
            if (!tr.docChanged || !value.matches.length) return value;
            return {
              ...value,
              matches: value.matches.map((x) => ({ ...x, from: tr.mapping.map(x.from), to: tr.mapping.map(x.to, -1) })).filter((x) => x.to > x.from),
            };
          },
        },
        props: {
          decorations(state) {
            const s = findKey.getState(state);
            if (!s?.matches.length) return null;
            return DecorationSet.create(
              state.doc,
              s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.current ? "pd-match pd-match-current" : "pd-match" })),
            );
          },
        },
      }),
    ];
  },
});

/** Shows matches and makes `current` the selected one (scrolled into view when `reveal`). */
export function showMatches(editor: Editor, matches: DocMatch[], current: number, reveal: boolean): void {
  const tr = editor.state.tr.setMeta(findKey, { matches, current }).setMeta("addToHistory", false);
  const m = matches[current];
  if (m && reveal) tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView();
  editor.view.dispatch(tr);
}

export function clearMatches(editor: Editor): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(findKey, { matches: [], current: -1 }).setMeta("addToHistory", false));
}

/** Replaces matches (all of them, or the one at `only`) in one undoable step. Returns how many. */
export function replaceMatches(editor: Editor, matches: DocMatch[], replacement: string, o: FindOptions, only?: number): number {
  const list = only == null ? matches : matches[only] ? [matches[only]!] : [];
  if (!list.length) return 0;
  const { state } = editor;
  const tr = state.tr;
  for (const m of [...list].sort((a, b) => b.from - a.from)) {
    const matched = state.doc.textBetween(m.from, m.to, "\n", "\ufffc");
    const text = replacementFor({ from: 0, to: 0, groups: m.groups }, matched, replacement, o);
    if (text) tr.insertText(text, m.from, m.to);
    else tr.delete(m.from, m.to);
  }
  editor.view.dispatch(tr.scrollIntoView());
  return list.length;
}
