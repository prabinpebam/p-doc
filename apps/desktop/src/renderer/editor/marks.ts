/**
 * Non-printing characters (U49, spec §4.11 item 4): a dot on each space and ↵ at each line break, drawn as
 * decorations only while they're shown. Paragraph marks, tab arrows and break labels are CSS (page.css,
 * `.pd-show-marks`). Print copies the blocks without them (print.ts).
 */
import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const marksKey = new PluginKey<DecorationSet | null>("pd-marks");

function lineBreak(): HTMLElement {
  const s = document.createElement("span");
  s.className = "pd-np-break";
  s.textContent = "↵";
  return s;
}

/** The marks for the text between two positions. */
function decorate(doc: PMNode, from: number, to: number, out: Decoration[]): void {
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText) {
      const t = node.text ?? "";
      for (let i = t.indexOf(" "); i >= 0; i = t.indexOf(" ", i + 1)) {
        if (pos + i >= from && pos + i + 1 <= to) out.push(Decoration.inline(pos + i, pos + i + 1, { class: "pd-np-space" }));
      }
      return false;
    }
    if (node.type.name === "hardBreak") {
      if (pos >= from) out.push(Decoration.widget(pos, lineBreak, { side: -1, key: "pd-np-break", ignoreSelection: true }));
      return false;
    }
    return true;
  });
}

function build(doc: PMNode): DecorationSet {
  const out: Decoration[] = [];
  decorate(doc, 0, doc.content.size, out);
  return DecorationSet.create(doc, out);
}

/** The set after an edit: mapped, with the changed paragraphs marked again. */
function update(set: DecorationSet, tr: Transaction): DecorationSet {
  let next = set.map(tr.mapping, tr.doc);
  let ranges: [number, number][] = [];
  for (const map of tr.mapping.maps) {
    ranges = ranges.map(([a, b]) => [map.map(a, -1), map.map(b, 1)]);
    map.forEach((_a, _b, s, e) => void ranges.push([s, e]));
  }
  for (const [a, b] of ranges) {
    const $a = tr.doc.resolve(Math.min(a, tr.doc.content.size));
    const $b = tr.doc.resolve(Math.min(b, tr.doc.content.size));
    const from = $a.parent.isTextblock ? $a.start() : $a.pos;
    const to = $b.parent.isTextblock ? $b.end() : $b.pos;
    next = next.remove(next.find(from, to).filter((d) => d.from >= from && d.to <= to));
    const add: Decoration[] = [];
    decorate(tr.doc, from, to, add);
    next = next.add(tr.doc, add);
  }
  return next;
}

export const NonPrinting = Extension.create({
  name: "nonPrinting",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet | null>({
        key: marksKey,
        state: {
          init: () => null,
          apply(tr, set, _old, state: EditorState) {
            const on = tr.getMeta(marksKey) as boolean | undefined;
            if (on === true) return set ?? build(state.doc);
            if (on === false) return null;
            return set && tr.docChanged ? update(set, tr) : set;
          },
        },
        props: {
          decorations: (state) => marksKey.getState(state) ?? null,
        },
      }),
    ];
  },
});

/** Shows or hides the marks. */
export function showMarks(view: { state: EditorState; dispatch: (tr: Transaction) => void }, on: boolean): void {
  if (!!marksKey.getState(view.state) === on) return;
  view.dispatch(view.state.tr.setMeta(marksKey, on).setMeta("addToHistory", false));
}
