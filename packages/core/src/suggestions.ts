/**
 * Suggesting (U22) and review (U24): in Suggesting mode, typed text becomes an `insertion` and deleted
 * text stays as a `deletion`; new and removed paragraph boundaries are block attributes (`split`,
 * `join`). Formatting changes apply directly (O6). Accept and reject run as one transform, used by the
 * editor (undoable) and over JSON (tests, CLI).
 */
import { Extension, type JSONContent } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Fragment, Slice, type Mark, type MarkType, type Node as PMNode, type Schema } from "@tiptap/pm/model";
import { Mapping, ReplaceStep, Transform, canJoin } from "@tiptap/pm/transform";
import { schema as pdocSchema } from "./schema.ts";

export interface SuggestionInfo {
  id: string;
  author: string;
  time: string;
}

export interface Change extends SuggestionInfo {
  kind: "insertion" | "deletion";
  /** The text involved ("¶" for a paragraph boundary). */
  text: string;
  /** Document position of its first part (editor documents only). */
  from: number;
  to: number;
}

const suggestionId = () => `s-${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

/** Every suggestion in document order, merged by id. */
export function changesOf(doc: PMNode): Change[] {
  const byId = new Map<string, Change>();
  const order: Change[] = [];
  const add = (c: Change) => {
    const key = `${c.kind}:${c.id}`;
    const have = byId.get(key);
    if (have) {
      have.text += c.text;
      have.to = Math.max(have.to, c.to);
    } else {
      byId.set(key, c);
      order.push(c);
    }
  };
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      for (const kind of ["split", "join"] as const) {
        const s = node.attrs[kind] as SuggestionInfo | null;
        if (s?.id) add({ ...s, kind: kind === "split" ? "insertion" : "deletion", text: "¶", from: pos, to: pos + 1 });
      }
    }
    if (node.isText) {
      for (const m of node.marks) {
        if (m.type.name === "insertion" || m.type.name === "deletion") {
          add({ id: m.attrs.id, author: m.attrs.author, time: m.attrs.time, kind: m.type.name as Change["kind"], text: node.text ?? "", from: pos, to: pos + node.nodeSize });
        }
      }
    }
    return true;
  });
  return order;
}

export type Decision = "accept" | "reject";

/**
 * Applies a decision to suggestions (all when `ids` is null). Works on a Transform or Transaction, so
 * the editor gets one undoable step.
 */
export function resolveSuggestions<T extends Transform>(tr: T, ids: ReadonlySet<string> | null, decision: Decision): T {
  const doc = tr.doc;
  const ins = doc.type.schema.marks.insertion!;
  const del = doc.type.schema.marks.deletion!;
  const hit = (id: unknown) => typeof id === "string" && id !== "" && (ids == null || ids.has(id));
  type Op = { pos: number; end: number; do: (t: Transform) => void };
  const ops: Op[] = [];
  doc.descendants((node, pos) => {
    if (node.isText) {
      const end = pos + node.nodeSize;
      for (const m of node.marks) {
        if (m.type === ins && hit(m.attrs.id)) ops.push({ pos, end, do: (t) => (decision === "accept" ? t.removeMark(pos, end, ins) : t.delete(pos, end)) });
        if (m.type === del && hit(m.attrs.id)) ops.push({ pos, end, do: (t) => (decision === "accept" ? t.delete(pos, end) : t.removeMark(pos, end, del)) });
      }
    } else if (node.isTextblock) {
      const split = node.attrs.split as SuggestionInfo | null;
      const join = node.attrs.join as SuggestionInfo | null;
      const mergeIt = (split && hit(split.id) && decision === "reject") || (join && hit(join.id) && decision === "accept");
      const clear = (split && hit(split.id)) || (join && hit(join.id));
      if (clear) {
        ops.push({
          pos: pos - 0.5,
          end: pos,
          do: (t) => {
            const at = t.doc.nodeAt(pos);
            if (at) t.setNodeMarkup(pos, undefined, { ...at.attrs, split: split && hit(split.id) ? null : at.attrs.split, join: join && hit(join.id) ? null : at.attrs.join });
            if (mergeIt && canJoin(t.doc, pos)) t.join(pos);
          },
        });
      }
    }
    return true;
  });
  // Last first, so earlier positions stay valid.
  ops.sort((a, b) => b.pos - a.pos);
  for (const op of ops) op.do(tr);
  return tr;
}

/** Accepts or rejects suggestions in document JSON. */
export function resolveJSON(content: JSONContent, ids: ReadonlySet<string> | null, decision: Decision, schema: Schema = pdocSchema()): JSONContent {
  const doc = schema.nodeFromJSON(content);
  return resolveSuggestions(new Transform(doc), ids, decision).doc.toJSON() as JSONContent;
}

export const acceptAll = (content: JSONContent) => resolveJSON(content, null, "accept");
export const rejectAll = (content: JSONContent) => resolveJSON(content, null, "reject");

export function listChanges(content: JSONContent, schema: Schema = pdocSchema()): Change[] {
  return changesOf(schema.nodeFromJSON(content));
}

// ---------------------------------------------------------------------------------------------
// Suggesting mode

export interface SuggestState {
  on: boolean;
  author: string;
}

export const suggestKey = new PluginKey<SuggestState>("pdoc-suggest");
export const SKIP_META = "pdoc-suggest-skip";

const markOf = (node: PMNode, type: MarkType): Mark | undefined => node.marks.find((m) => m.type === type);

/** Turns a deleted slice into what stays visible: others' text marked deleted, own insertions dropped. */
function keepDeleted(fragment: Fragment, info: SuggestionInfo, ins: MarkType, del: MarkType): Fragment {
  const out: PMNode[] = [];
  fragment.forEach((node) => {
    if (node.isText) {
      const own = markOf(node, ins);
      if (own && own.attrs.author === info.author) return;
      if (markOf(node, del)) out.push(node);
      else out.push(node.mark(del.create(info).addToSet(own ? ins.removeFromSet(node.marks) : node.marks)));
    } else if (node.isInline) {
      out.push(node);
    } else {
      out.push(node.copy(keepDeleted(node.content, info, ins, del)));
    }
  });
  return Fragment.fromArray(out);
}

const hasText = (f: Fragment) => {
  let t = false;
  f.descendants((n) => {
    if (n.isText || (n.isInline && n.isLeaf)) t = true;
    return !t;
  });
  return t;
};

/**
 * The info of an adjacent suggestion of the same kind and author, so a word typed is one change
 * (and one mark: same id, author and start time).
 */
function neighbour(doc: PMNode, pos: number, type: MarkType, author: string): SuggestionInfo | null {
  const $p = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (const n of [$p.nodeBefore, $p.nodeAfter]) {
    const m = n && markOf(n, type);
    if (m && m.attrs.author === author) return { id: m.attrs.id, author, time: m.attrs.time };
  }
  return null;
}

/** The transaction that turns direct edits into suggestions, or null. */
export function suggestEdits(trs: readonly Transaction[], oldState: EditorState, newState: EditorState, st: SuggestState): Transaction | null {
  if (!st.on) return null;
  const schema = newState.schema;
  const ins = schema.marks.insertion!;
  const del = schema.marks.deletion!;
  const out = newState.tr;
  let changed = false;
  let caret: number | null = null;
  const time = new Date().toISOString();
  trs.forEach((t, ti) => {
    if (!t.docChanged || t.getMeta(SKIP_META) || t.getMeta("pdoc-toc") || t.getMeta("history$") || t.getMeta("appendedTransaction")) return;
    const later = new Mapping();
    for (const lt of trs.slice(ti + 1)) later.appendMapping(lt.mapping);
    t.steps.forEach((step, i) => {
      if (!(step instanceof ReplaceStep)) return;
      const s = step as ReplaceStep & { from: number; to: number; slice: Slice };
      const before = t.docs[i]!;
      const rest = new Mapping(t.mapping.maps.slice(i + 1));
      rest.appendMapping(later);
      rest.appendMapping(out.mapping);
      const a = rest.map(s.from, -1);
      const b = rest.map(s.from + s.slice.size, 1);
      // Inserted text and new paragraph boundaries.
      if (s.slice.size > 0 && b > a) {
        const info = neighbour(out.doc, a, ins, st.author) ?? { id: suggestionId(), author: st.author, time };
        out.removeMark(a, b, del);
        out.addMark(a, b, ins.create(info));
        out.doc.nodesBetween(a, b, (node, pos) => {
          if (node.isTextblock && pos > a && pos < b && !node.attrs.split) out.setNodeMarkup(pos, undefined, { ...node.attrs, split: info });
          return true;
        });
        changed = true;
      }
      // Deleted text stays, marked.
      if (s.to > s.from) {
        const sliced = before.slice(s.from, s.to);
        const info = neighbour(out.doc, a, del, st.author) ?? { id: suggestionId(), author: st.author, time };
        const kept = keepDeleted(sliced.content, info, ins, del);
        const multi = sliced.openStart > 0 && sliced.content.childCount > 1;
        // Own split boundaries deleted with their text simply go.
        const ownSplits: boolean[] = [];
        before.nodesBetween(s.from, s.to, (node, pos) => {
          if (node.isTextblock && pos > s.from && pos < s.to) ownSplits.push((node.attrs.split as SuggestionInfo | null)?.author === st.author);
          return true;
        });
        if (multi || hasText(kept)) {
          const slice = new Slice(kept, sliced.openStart, sliced.openEnd);
          const startSize = out.doc.content.size;
          out.replace(a, a, slice);
          const end = a + (out.doc.content.size - startSize);
          const blocks: number[] = [];
          out.doc.nodesBetween(a, end, (node, pos) => {
            if (node.isTextblock && pos > a && pos < end) blocks.push(pos);
            return true;
          });
          for (let k = blocks.length - 1; k >= 0; k--) {
            const pos = blocks[k]!;
            const node = out.doc.nodeAt(pos)!;
            if (ownSplits[k] && canJoin(out.doc, pos)) out.join(pos);
            else out.setNodeMarkup(pos, undefined, { ...node.attrs, split: null, join: info });
          }
          const sel = oldState.selection;
          const backspace = ti === 0 && sel.empty && sel.from === s.to && s.slice.size === 0;
          caret = backspace ? a : null;
          changed = true;
        }
      }
    });
  });
  if (!changed) return null;
  if (caret != null) out.setSelection(TextSelection.create(out.doc, caret));
  return out.setMeta(SKIP_META, true);
}

/** The Suggesting plugin: off until `setMeta(suggestKey, { on: true })`. */
export function suggestPlugin(author: string, on = false): Plugin<SuggestState> {
  return new Plugin<SuggestState>({
    key: suggestKey,
    state: {
      init: () => ({ on, author }),
      apply: (tr, value) => {
        const m = tr.getMeta(suggestKey) as Partial<SuggestState> | undefined;
        return m ? { ...value, ...m } : value;
      },
    },
    appendTransaction: (trs, oldState, newState) => suggestEdits(trs, oldState, newState, suggestKey.getState(newState)!),
  });
}

export interface SuggestOptions {
  author: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    suggest: {
      setSuggesting: (on: boolean) => ReturnType;
      setSuggestAuthor: (author: string) => ReturnType;
      resolveChanges: (ids: string[] | null, decision: Decision) => ReturnType;
    };
  }
}

export const Suggest = Extension.create<SuggestOptions>({
  name: "suggest",
  addOptions: () => ({ author: "Me" }),
  addProseMirrorPlugins() {
    return [suggestPlugin(this.options.author)];
  },
  addCommands() {
    return {
      setSuggesting:
        (on) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(suggestKey, { on });
          return true;
        },
      setSuggestAuthor:
        (author) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(suggestKey, { author });
          return true;
        },
      resolveChanges:
        (ids, decision) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            resolveSuggestions(tr, ids ? new Set(ids) : null, decision);
            tr.setMeta(SKIP_META, true);
          }
          return true;
        },
    };
  },
});
