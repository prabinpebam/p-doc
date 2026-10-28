/**
 * Suggesting (U22) and review (U24): in Suggesting mode, typed text becomes an `insertion` and deleted
 * text stays as a `deletion`; new and removed paragraph boundaries are block attributes (`split`,
 * `join`). Formatting changes are suggestions too (U63): a `formatChange` mark on text holds the
 * formatting marks it had, and a `formatChange` attribute on a paragraph holds its old type and attributes.
 * Accept and reject run as one transform, used by the editor (undoable) and over JSON (tests, CLI).
 */
import { Extension, type JSONContent } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { Fragment, Slice, type Mark, type MarkType, type Node as PMNode, type Schema } from "@tiptap/pm/model";
import { AddMarkStep, AttrStep, Mapping, RemoveMarkStep, ReplaceAroundStep, ReplaceStep, Transform, canJoin, type Step } from "@tiptap/pm/transform";
import { schema as pdocSchema } from "./schema.ts";

export interface SuggestionInfo {
  id: string;
  author: string;
  time: string;
}

export interface Change extends SuggestionInfo {
  kind: "insertion" | "deletion" | "format";
  /** The text involved ("¶" for a paragraph boundary). */
  text: string;
  /** For a formatting suggestion, what changed: "Bold", "Not italic", "Heading 1", "Align centre". */
  format?: string;
  /** Document position of its first part (editor documents only). */
  from: number;
  to: number;
}

/** null means Everyone; an empty selection shows no suggestions (U65). */
export function changesByReviewer(changes: readonly Change[], reviewers: readonly string[] | null): Change[] {
  if (reviewers === null) return [...changes];
  const selected = new Set(reviewers);
  return changes.filter((c) => selected.has(c.author));
}

const suggestionId = () => `s-${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

/** A formatting suggestion on a paragraph: the type and attributes it had. */
export interface BlockFormatChange extends SuggestionInfo {
  old: { type: string; attrs: Record<string, unknown> };
}

/** Marks that are content or review, not formatting: a formatting suggestion neither records nor restores them. */
const NOT_FORMAT = new Set(["insertion", "deletion", "formatChange", "comment", "link"]);
const BLOCK_REVIEW = new Set(["split", "join", "formatChange", "blockChange", "id"]);
export const isFormatMark = (name: string) => !NOT_FORMAT.has(name);

type MarkJSON = { type: string; attrs?: Record<string, unknown> };
const formatMarks = (marks: readonly Mark[]): MarkJSON[] => marks.filter((m) => isFormatMark(m.type.name)).map((m) => m.toJSON() as MarkJSON);
const key = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as object).filter(([, y]) => y != null).sort(([a], [b]) => a.localeCompare(b))) : x));
const sameMarks = (a: MarkJSON[], b: MarkJSON[]) => key([...a].map(key).sort()) === key([...b].map(key).sort());
const blockFormat = (n: PMNode) => ({ type: n.type.name, attrs: Object.fromEntries(Object.entries(n.attrs).filter(([k]) => !BLOCK_REVIEW.has(k))) });
const sameBlock = (a: { type: string; attrs: Record<string, unknown> }, b: { type: string; attrs: Record<string, unknown> }) => a.type === b.type && key(a.attrs) === key(b.attrs);

const MARK_NAMES: Record<string, string> = { bold: "Bold", italic: "Italic", underline: "Underline", strike: "Strikethrough", superscript: "Superscript", subscript: "Subscript", code: "Code", highlight: "Highlight" };
const STYLE_NAMES: Record<string, string> = { fontFamily: "Font", fontSize: "Size", color: "Text colour", backgroundColor: "Background colour" };

/** What a formatting suggestion on text changed, as the card says it: "Bold, Size: 14pt" or "Not italic". */
export function describeFormat(old: MarkJSON[], now: MarkJSON[]): string {
  const out: string[] = [];
  const find = (list: MarkJSON[], t: string) => list.find((m) => m.type === t);
  for (const t of new Set([...old, ...now].map((m) => m.type))) {
    const a = find(old, t);
    const b = find(now, t);
    if (t === "textStyle") {
      for (const k of new Set([...Object.keys(a?.attrs ?? {}), ...Object.keys(b?.attrs ?? {})])) {
        const x = a?.attrs?.[k] ?? null;
        const y = b?.attrs?.[k] ?? null;
        if (key(x) === key(y)) continue;
        const name = STYLE_NAMES[k] ?? "Text style";
        out.push(y == null ? `${name}: default` : k === "fontFamily" || k === "fontSize" ? `${name}: ${String(y).split(",")[0]!.replace(/[\x27"]/g, "")}` : name);
      }
      continue;
    }
    const name = MARK_NAMES[t] ?? t;
    if (a && !b) out.push(`Not ${name.toLowerCase()}`);
    else if (b && (!a || key(a) !== key(b))) out.push(name);
  }
  return out.join(", ") || "Formatting";
}

const ALIGN: Record<string, string> = { left: "Align left", center: "Align centre", right: "Align right", justify: "Justify" };
const styleName = (b: { type: string; attrs: Record<string, unknown> }) =>
  b.type === "heading" ? `Heading ${String(b.attrs.level ?? 1)}` : b.attrs.textStyle === "title" ? "Title" : b.attrs.textStyle === "subtitle" ? "Subtitle" : "Normal text";

/** What a formatting suggestion on a paragraph changed: "Heading 1", "Align centre", "Paragraph formatting". */
export function describeBlockFormat(old: { type: string; attrs: Record<string, unknown> }, now: { type: string; attrs: Record<string, unknown> }): string {
  const out: string[] = [];
  if (styleName(old) !== styleName(now)) out.push(styleName(now));
  const rest = (b: typeof old) => Object.fromEntries(Object.entries(b.attrs).filter(([k]) => k !== "level" && k !== "textStyle" && k !== "textAlign"));
  if ((old.attrs.textAlign ?? null) !== (now.attrs.textAlign ?? null)) out.push(ALIGN[String(now.attrs.textAlign)] ?? "Align left");
  if (key(rest(old)) !== key(rest(now))) out.push("Paragraph formatting");
  return out.join(", ") || "Formatting";
}

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
      if (c.format && have.format) {
        const parts = have.format.split(", ");
        for (const part of c.format.split(", ")) if (!parts.includes(part)) parts.push(part);
        have.format = parts.filter((x) => x !== "Formatting" || parts.length === 1).join(", ");
      }
    } else {
      byId.set(key, c);
      order.push(c);
    }
  };
  doc.descendants((node, pos) => {
    const b = node.attrs.blockChange as (SuggestionInfo & { kind: "insertion" | "deletion" }) | null | undefined;
    if (b?.id) add({ id: b.id, author: b.author, time: b.time, kind: b.kind === "deletion" ? "deletion" : "insertion", text: blockLabel(node), from: pos, to: pos + node.nodeSize });
    if (node.isTextblock) {
      for (const kind of ["split", "join"] as const) {
        const s = node.attrs[kind] as SuggestionInfo | null;
        if (s?.id) add({ ...s, kind: kind === "split" ? "insertion" : "deletion", text: "¶", from: pos, to: pos + 1 });
      }
      const f = node.attrs.formatChange as BlockFormatChange | null;
      if (f?.id) add({ id: f.id, author: f.author, time: f.time, kind: "format", text: node.textContent, format: describeBlockFormat(f.old, blockFormat(node)), from: pos, to: pos + node.nodeSize });
    }
    if (node.isInline) {
      for (const m of node.marks) {
        if (m.type.name === "insertion" || m.type.name === "deletion") {
          add({ id: m.attrs.id, author: m.attrs.author, time: m.attrs.time, kind: m.type.name as Change["kind"], text: node.text ?? blockLabel(node), from: pos, to: pos + node.nodeSize });
        }
        if (m.type.name === "formatChange") {
          add({ id: m.attrs.id, author: m.attrs.author, time: m.attrs.time, kind: "format", text: node.text ?? blockLabel(node), format: describeFormat(m.attrs.old as MarkJSON[], formatMarks(node.marks)), from: pos, to: pos + node.nodeSize });
        }
      }
    }
    return true;
  });
  return order;
}

const OBJECT_NAMES: Record<string, string> = {
  image: "Image",
  table: "Table",
  mathBlock: "Equation",
  mathInline: "Equation",
  horizontalRule: "Line",
  pageBreak: "Page break",
  sectionBreak: "Section break",
  columnBreak: "Column break",
  tableOfContents: "Contents",
  noteRef: "Note",
  hardBreak: "Line break",
  tab: "Tab",
  bookmark: "Bookmark",
};

/** A block's or object's text, or its name in brackets when it has none ("[Image]"). */
const blockLabel = (node: PMNode) => node.textContent || `[${OBJECT_NAMES[node.type.name] ?? "Object"}]`;

export type Decision = "accept" | "reject";

/**
 * Applies a decision to suggestions (all when `ids` is null). Works on a Transform or Transaction, so
 * the editor gets one undoable step.
 */
export function resolveSuggestions<T extends Transform>(tr: T, ids: ReadonlySet<string> | null, decision: Decision): T {
  const doc = tr.doc;
  const ins = doc.type.schema.marks.insertion!;
  const del = doc.type.schema.marks.deletion!;
  const fc = doc.type.schema.marks.formatChange!;
  const schema = doc.type.schema;
  const hit = (id: unknown) => typeof id === "string" && id !== "" && (ids == null || ids.has(id));
  type Op = { pos: number; end: number; do: (t: Transform) => void };
  const ops: Op[] = [];
  doc.descendants((node, pos) => {
    const b = node.attrs.blockChange as (SuggestionInfo & { kind: string }) | null | undefined;
    if (b && hit(b.id)) {
      const remove = (b.kind === "deletion") === (decision === "accept");
      // After every decision inside and at the start of this block.
      ops.push({
        pos: pos - 0.75,
        end: pos,
        do: (t) => {
          const at = t.doc.nodeAt(pos);
          if (!at) return;
          if (remove) t.delete(pos, pos + at.nodeSize);
          else t.setNodeMarkup(pos, undefined, { ...at.attrs, blockChange: null });
        },
      });
    }
    if (node.isInline) {
      const end = pos + node.nodeSize;
      for (const m of node.marks) {
        if (m.type === ins && hit(m.attrs.id)) ops.push({ pos, end, do: (t) => (decision === "accept" ? t.removeMark(pos, end, ins) : t.delete(pos, end)) });
        if (m.type === del && hit(m.attrs.id)) ops.push({ pos, end, do: (t) => (decision === "accept" ? t.delete(pos, end) : t.removeMark(pos, end, del)) });
        if (m.type === fc && hit(m.attrs.id)) {
          const marks = node.marks;
          ops.push({
            pos,
            end,
            do: (t) => {
              if (decision === "reject") {
                for (const k of marks) if (isFormatMark(k.type.name)) t.removeMark(pos, end, k.type);
                for (const j of (m.attrs.old ?? []) as MarkJSON[]) {
                  try {
                    t.addMark(pos, end, schema.markFromJSON(j));
                  } catch {
                    // A mark this schema doesn't know stays out.
                  }
                }
              }
              t.removeMark(pos, end, fc);
            },
          });
        }
      }
    } else if (node.isTextblock) {
      const f = node.attrs.formatChange as BlockFormatChange | null;
      if (f && hit(f.id)) {
        // Before the boundary decisions at this block (they run last, at pos - 0.5).
        ops.push({
          pos: pos - 0.25,
          end: pos,
          do: (t) => {
            const at = t.doc.nodeAt(pos);
            if (!at) return;
            const type = decision === "reject" ? (schema.nodes[f.old.type] ?? at.type) : at.type;
            const attrs = decision === "reject" ? { ...f.old.attrs, id: "id" in f.old.attrs ? f.old.attrs.id : at.attrs.id, split: at.attrs.split, join: at.attrs.join, blockChange: at.attrs.blockChange } : at.attrs;
            t.setNodeMarkup(pos, type, { ...attrs, formatChange: null });
          },
        });
      }
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
  const fc = schema.marks.formatChange!;
  const out = newState.tr;
  let changed = false;
  let caret: number | null = null;
  const time = new Date().toISOString();
  // One formatting suggestion per transaction: "Bold" on three words is one change.
  let formatInfo: SuggestionInfo | null = null;
  const textRanges: [number, number][] = [];
  const blockSpots: number[] = [];
  trs.forEach((t, ti) => {
    if (!t.docChanged || t.getMeta(SKIP_META) || t.getMeta("pdoc-toc") || t.getMeta("history$") || t.getMeta("appendedTransaction")) return;
    const later = new Mapping();
    for (const lt of trs.slice(ti + 1)) later.appendMapping(lt.mapping);
    t.steps.forEach((step, i) => {
      if (!(step instanceof ReplaceStep)) {
        const before = t.docs[i]!;
        const after = t.docs[i + 1] ?? t.doc;
        const rest = new Mapping(t.mapping.maps.slice(i + 1));
        rest.appendMapping(later);
        rest.appendMapping(out.mapping);
        formatInfo ??= { id: suggestionId(), author: st.author, time };
        if (recordFormat(step, before, after, rest, out, formatInfo, st.author, ins, del, fc, textRanges, blockSpots)) changed = true;
        return;
      }
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
  // A formatting change undone by hand (bold, then not bold) is no change.
  for (const [a, b] of textRanges) {
    const from = out.mapping.map(a, -1);
    const to = Math.min(out.mapping.map(b, 1), out.doc.content.size);
    out.doc.nodesBetween(from, to, (node, pos) => {
      const m = node.isText ? markOf(node, fc) : undefined;
      if (m && sameMarks(m.attrs.old as MarkJSON[], formatMarks(node.marks))) out.removeMark(Math.max(pos, from), Math.min(pos + node.nodeSize, to), m);
      return true;
    });
  }
  for (const p of blockSpots) {
    const pos = out.mapping.map(p, 1);
    const node = out.doc.nodeAt(pos);
    const f = node?.isTextblock ? (node.attrs.formatChange as BlockFormatChange | null) : null;
    if (node && f && sameBlock(f.old, blockFormat(node))) out.setNodeMarkup(pos, undefined, { ...node.attrs, formatChange: null });
  }
  if (caret != null) out.setSelection(TextSelection.create(out.doc, caret));
  return out.setMeta(SKIP_META, true);
}

/**
 * Records a formatting step (marks on text, or a paragraph's type or attributes) as a suggestion, keeping what
 * the text or paragraph had before. Text already in a suggested insertion or deletion just takes the change.
 * Positions it touches go into `textRanges` and `blockSpots` (in the mapping before `out`'s own steps).
 */
function recordFormat(
  step: Step,
  before: PMNode,
  after: PMNode,
  rest: Mapping,
  out: Transaction,
  info: SuggestionInfo,
  author: string,
  ins: MarkType,
  del: MarkType,
  fc: MarkType,
  textRanges: [number, number][],
  blockSpots: number[],
): boolean {
  let changed = false;
  const base = (p: number) => out.mapping.invert().map(p);
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
    const ms = step as (AddMarkStep | RemoveMarkStep) & { from: number; to: number; mark: Mark };
    if (!isFormatMark(ms.mark.type.name)) return false;
    before.nodesBetween(ms.from, ms.to, (node, pos) => {
      if (!node.isText) return true;
      if (node.marks.some((m) => m.type === ins || m.type === del)) return false;
      const a = rest.map(Math.max(pos, ms.from), 1);
      const b = rest.map(Math.min(pos + node.nodeSize, ms.to), -1);
      if (b <= a) return false;
      if (!markOf(node, fc)) out.addMark(a, b, fc.create({ ...info, old: formatMarks(node.marks) }));
      textRanges.push([base(a), base(b)]);
      changed = true;
      return false;
    });
    return changed;
  }
  if (!(step instanceof ReplaceAroundStep || step instanceof AttrStep)) return false;
  const s = step as Step & { from?: number; to?: number; pos?: number };
  const from = s.pos ?? s.from ?? 0;
  const to = s.pos != null ? s.pos + 1 : (s.to ?? from);
  const map = step.getMap();
  before.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    if (pos < from) return false;
    const np = map.map(pos, 1);
    const now = after.nodeAt(np);
    if (!now?.isTextblock || sameBlock(blockFormat(node), blockFormat(now))) return false;
    const op = rest.map(np, 1);
    const target = out.doc.nodeAt(op);
    if (!target?.isTextblock) return false;
    // A new type of block starts without the review attributes the old one had.
    const split = (target.attrs.split ?? node.attrs.split ?? null) as SuggestionInfo | null;
    const join = target.attrs.join ?? node.attrs.join ?? null;
    const own = split?.author === author;
    const formatChange = target.attrs.formatChange ?? node.attrs.formatChange ?? (own ? null : ({ ...info, old: blockFormat(node) } satisfies BlockFormatChange));
    if (split !== target.attrs.split || join !== target.attrs.join || formatChange !== target.attrs.formatChange) out.setNodeMarkup(op, undefined, { ...target.attrs, split, join, formatChange });
    if (formatChange) blockSpots.push(base(op));
    changed = true;
    return false;
  });
  return changed;
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
            // Its own undo step, even straight after the edit it decides on.
            closeHistory(tr);
            resolveSuggestions(tr, ids ? new Set(ids) : null, decision);
            tr.setMeta(SKIP_META, true);
          }
          return true;
        },
    };
  },
});
