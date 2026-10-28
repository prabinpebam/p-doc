/**
 * Footnotes and endnotes (U51, O19): a reference is an inline atom in the text; its note lives in a
 * `notes` container at the end of the document, keyed by id. The container is kept in step with the
 * references (NotesSync): a new reference gets a note, deleting the reference deletes its note (cut and
 * paste brings it back), a copied reference gets a copy, and the notes are ordered footnotes first,
 * then endnotes, each in the order of their references. Numbers are never stored: they are drawn from
 * that order, so they always follow the text.
 */
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type NoteKind = "footnote" | "endnote";
/** Number formats, as in Word: 1, 2, 3 · a, b, c · A, B, C · i, ii, iii · I, II, III · *, †, ‡. */
export type NoteFormat = "1" | "a" | "A" | "i" | "I" | "*";
export const NOTE_FORMATS: NoteFormat[] = ["1", "a", "A", "i", "I", "*"];
export const DEFAULT_FORMATS: Record<NoteKind, NoteFormat> = { footnote: "1", endnote: "i" };

const ROMAN: [number, string][] = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];
const SYMBOLS = ["*", "†", "‡", "§"];

/** The label of the `n`th note (1-based) in a format. */
export function formatNumber(n: number, f: NoteFormat): string {
  switch (f) {
    case "a":
    case "A": {
      let s = "";
      for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(97 + ((k - 1) % 26)) + s;
      return f === "A" ? s.toUpperCase() : s;
    }
    case "i":
    case "I": {
      let s = "";
      let k = n;
      for (const [v, r] of ROMAN) for (; k >= v; k -= v) s += r;
      return f === "I" ? s.toUpperCase() : s;
    }
    case "*":
      return SYMBOLS[(n - 1) % SYMBOLS.length]!.repeat(Math.floor((n - 1) / SYMBOLS.length) + 1);
    default:
      return String(n);
  }
}

/** Labels to render exports with (set while an export renders; the live editor draws numbers as decorations). */
let renderLabels: Map<string, string> | null = null;
export function withNoteLabels<T>(labels: Map<string, string>, fn: () => T): T {
  renderLabels = labels;
  try {
    return fn();
  } finally {
    renderLabels = null;
  }
}

const kindAttr = {
  default: "footnote",
  parseHTML: (el: HTMLElement) => (el.getAttribute("data-kind") === "endnote" ? "endnote" : "footnote"),
  renderHTML: (a: Record<string, unknown>) => ({ "data-kind": a.kind }),
};
const idAttr = {
  default: null,
  parseHTML: (el: HTMLElement) => el.getAttribute("data-id"),
  renderHTML: (a: Record<string, unknown>) => (a.id ? { "data-id": a.id } : {}),
};
const quoted = (s: string) => `"${s.replace(/["\\]/g, "\\$&")}"`;

/** The number in the text. */
export const NoteRef = Node.create({
  name: "noteRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ id: idAttr, kind: kindAttr }),
  // Above the superscript mark's plain "sup" rule.
  parseHTML: () => [{ tag: 'sup[data-type="note-ref"]', priority: 60 }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const n = renderLabels?.get(String(node.attrs.id));
    const attrs = mergeAttributes(HTMLAttributes, { "data-type": "note-ref", class: "pd-note-ref" });
    return n ? ["sup", attrs, ["a", { href: `#note-${node.attrs.id}`, id: `ref-${node.attrs.id}` }, n]] : ["sup", attrs];
  },
  renderText: ({ node }) => (renderLabels?.get(String(node.attrs.id)) ? `[${renderLabels.get(String(node.attrs.id))}]` : ""),
});

/** One note's text. */
export const Note = Node.create({
  name: "note",
  content: "paragraph+",
  isolating: true,
  defining: true,
  addAttributes: () => ({ id: idAttr, kind: kindAttr }),
  parseHTML: () => [{ tag: 'div[data-type="note"]' }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const n = renderLabels?.get(String(node.attrs.id));
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "note", class: "pd-note" }, n ? { id: `note-${node.attrs.id}`, style: `--pd-n: ${quoted(n)}` } : {}), 0];
  },
});

/** Every note, at the end of the document; also holds the number formats (Format > Notes…). */
export const Notes = Node.create({
  name: "notes",
  content: "note+",
  isolating: true,
  addAttributes: () => ({
    footFormat: { default: DEFAULT_FORMATS.footnote, parseHTML: (el) => el.getAttribute("data-foot-format") || DEFAULT_FORMATS.footnote, renderHTML: (a) => ({ "data-foot-format": a.footFormat }) },
    endFormat: { default: DEFAULT_FORMATS.endnote, parseHTML: (el) => el.getAttribute("data-end-format") || DEFAULT_FORMATS.endnote, renderHTML: (a) => ({ "data-end-format": a.endFormat }) },
  }),
  parseHTML: () => [{ tag: 'section[data-type="notes"]' }],
  renderHTML: ({ HTMLAttributes }) => ["section", mergeAttributes(HTMLAttributes, { "data-type": "notes", class: "pd-notes" }), 0],
});

/** The document: blocks, then the notes when there are any. */
export const NotesDoc = Node.create({ name: "doc", topNode: true, content: "block+ notes?" });

// ------------------------------------------------------------------------------ Reading

/** The notes container and its position, when the document has one. */
export function notesOf(doc: PMNode): { node: PMNode; pos: number } | null {
  const last = doc.lastChild;
  return last?.type.name === "notes" ? { node: last, pos: doc.content.size - last.nodeSize } : null;
}

export interface RefAt {
  id: string;
  kind: NoteKind;
  pos: number;
}

/** The references in the text, in order. */
export function refsOf(doc: PMNode): RefAt[] {
  const out: RefAt[] = [];
  doc.forEach((block, offset) => {
    if (block.type.name === "notes") return;
    block.descendants((n, p) => {
      if (n.type.name === "noteRef") out.push({ id: String(n.attrs.id ?? ""), kind: n.attrs.kind === "endnote" ? "endnote" : "footnote",       pos: offset + 1 + p });
          });
  });
  return out;
}

/** Each note's label by id: footnotes and endnotes count separately, in the order of their references. */
export function noteLabels(doc: PMNode): Map<string, string> {
  const box = notesOf(doc);
  const formats: Record<NoteKind, NoteFormat> = {
    footnote: (box?.node.attrs.footFormat as NoteFormat) ?? DEFAULT_FORMATS.footnote,
    endnote: (box?.node.attrs.endFormat as NoteFormat) ?? DEFAULT_FORMATS.endnote,
  };
  const count: Record<NoteKind, number> = { footnote: 0, endnote: 0 };
  const out = new Map<string, string>();
  for (const r of refsOf(doc)) if (!out.has(r.id)) out.set(r.id, formatNumber(++count[r.kind], formats[r.kind]));
  return out;
}

/** The same labels from stored content (exports). */
export function noteLabelsOf(content: JSONContent): Map<string, string> {
  const box = content.content?.find((b) => b.type === "notes");
  const formats: Record<NoteKind, NoteFormat> = {
    footnote: (box?.attrs?.footFormat as NoteFormat) ?? DEFAULT_FORMATS.footnote,
    endnote: (box?.attrs?.endFormat as NoteFormat) ?? DEFAULT_FORMATS.endnote,
  };
  const count: Record<NoteKind, number> = { footnote: 0, endnote: 0 };
  const out = new Map<string, string>();
  const walk = (n: JSONContent) => {
    if (n.type === "notes") return;
    if (n.type === "noteRef") {
      const id = String(n.attrs?.id ?? "");
      const kind: NoteKind = n.attrs?.kind === "endnote" ? "endnote" : "footnote";
      if (!out.has(id)) out.set(id, formatNumber(++count[kind], formats[kind]));
    }
    n.content?.forEach(walk);
  };
  walk(content);
  return out;
}

/** The notes of stored content, in order: what exports list. */
export function notesListOf(content: JSONContent): { id: string; kind: NoteKind; content: JSONContent[] }[] {
  const box = content.content?.find((b) => b.type === "notes");
  return (box?.content ?? []).map((n) => ({ id: String(n.attrs?.id ?? ""), kind: n.attrs?.kind === "endnote" ? "endnote" : "footnote", content: n.content ?? [] }));
}

// ------------------------------------------------------------------------------ Keeping notes in step

/** Notes whose reference was deleted, so pasting the reference back (cut and paste) brings the note. */
const lost = new Map<string, PMNode>();
let seq = 0;
export const newNoteId = () => `n${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const TRAILING_OK = new Set(["paragraph", "heading", "blockquote", "bulletList", "orderedList", "taskList"]);

/**
 * The transaction that puts the notes in step with the references, or null when they are. Keeps a caret
 * inside a note in the same place in that note.
 */
export function fixNotes(state: EditorState): Transaction | null {
  const { doc, schema } = state;
  const box = notesOf(doc);
  const refs = refsOf(doc);
  if (!box && !refs.length) return null;
  const tr = state.tr;
  const bodies = new Map<string, PMNode>();
  box?.node.forEach((n) => void bodies.set(String(n.attrs.id), n));
  const seen = new Set<string>();
  const want: { id: string; kind: NoteKind; from?: string }[] = [];
  for (const r of refs) {
    if (!r.id || seen.has(r.id)) {
      const id = newNoteId();
      tr.setNodeMarkup(r.pos, undefined, { id, kind: r.kind });
      want.push({ id, kind: r.kind, from: r.id });
      seen.add(id);
    } else {
      want.push({ id: r.id, kind: r.kind });
      seen.add(r.id);
    }
  }
  const ordered = [...want.filter((w) => w.kind === "footnote"), ...want.filter((w) => w.kind === "endnote")];
  const current = box ? (box.node.content.content as PMNode[]).map((n) => `${n.attrs.id}:${n.attrs.kind}`).join(",") : "";
  const next = ordered.map((w) => `${w.id}:${w.kind}`).join(",");
  let lastBlock = box ? doc.child(doc.childCount - 2) : doc.lastChild;
  const needTrailing = ordered.length > 0 && !!lastBlock && !TRAILING_OK.has(lastBlock.type.name);
  if (current === next && !needTrailing && tr.steps.length === 0) return null;
  if (current !== next) {
    for (const [id, n] of bodies) if (!seen.has(id)) lost.set(id, n);
    const note = schema.nodes.note!;
    const children = ordered.map((w) => {
      const old = bodies.get(w.id) ?? (w.from ? bodies.get(w.from) : undefined) ?? lost.get(w.id);
      if (old && !w.from) lost.delete(w.id);
      return note.create({ id: w.id, kind: w.kind }, old ? old.content : schema.nodes.paragraph!.create());
    });
    // Where the caret is inside a note: which note, and how far in.
    const sel = state.selection;
    let keep: { id: string; offset: number } | null = null;
    if (box && sel.empty && sel.from > box.pos) {
      box.node.forEach((n, off) => {
        const start = box.pos + 1 + off;
        if (sel.from > start && sel.from < start + n.nodeSize) keep = { id: String(n.attrs.id), offset: sel.from - start };
      });
    }
    if (box) {
      if (children.length) tr.replaceWith(box.pos, box.pos + box.node.nodeSize, schema.nodes.notes!.create(box.node.attrs, children));
      else tr.delete(box.pos, box.pos + box.node.nodeSize);
    } else if (children.length) tr.insert(tr.doc.content.size, schema.nodes.notes!.create(null, children));
    const fresh = notesOf(tr.doc);
    const k = keep as { id: string; offset: number } | null;
    if (fresh && k) {
      fresh.node.forEach((n, off) => {
        if (String(n.attrs.id) !== k.id) return;
        const start = fresh.pos + 1 + off;
        tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(start + k.offset, start + n.nodeSize - 2))));
      });
    }
  }
  // A table, rule or break is never the last block of the text, as in Word.
  const after = notesOf(tr.doc);
  lastBlock = after ? tr.doc.child(tr.doc.childCount - 2) : null;
  if (after && lastBlock && !TRAILING_OK.has(lastBlock.type.name)) tr.insert(after.pos, schema.nodes.paragraph!.create());
  return tr.steps.length ? tr : null;
}

/** Whether a transaction could have changed the notes: it touches a document that has them, or adds a reference. */
function touchesNotes(trs: readonly Transaction[], old: PMNode): boolean {
  if (notesOf(old)) return true;
  return trs.some((t) =>
    t.steps.some((s) => {
      const slice = (s as unknown as { slice?: { content: { descendants(f: (n: PMNode) => boolean | void): void } } }).slice;
      let found = false;
      slice?.content.descendants((n) => {
        if (n.type.name === "noteRef" || n.type.name === "notes") found = true;
        return !found;
      });
      return found;
    }),
  );
}

export const notesKey = new PluginKey<DecorationSet>("pdoc-notes");

/** Numbers on references and notes, as decorations (a CSS variable and an accessible name). */
function numberDecos(doc: PMNode): DecorationSet {
  const box = notesOf(doc);
  if (!box) return DecorationSet.empty;
  const labels = noteLabels(doc);
  const decos: Decoration[] = [];
  for (const r of refsOf(doc)) {
    const n = labels.get(r.id) ?? "";
    decos.push(Decoration.node(r.pos, r.pos + 1, { style: `--pd-n: ${quoted(n)}`, "data-n": n, "aria-label": `${r.kind === "endnote" ? "Endnote" : "Footnote"} ${n}` }));
  }
  let ends = false;
  box.node.forEach((n, off) => {
    const at = box.pos + 1 + off;
    const label = labels.get(String(n.attrs.id)) ?? "";
    const first = n.attrs.kind === "endnote" && !ends;
    if (first) ends = true;
    decos.push(Decoration.node(at, at + n.nodeSize, { style: `--pd-n: ${quoted(label)}`, "data-n": label, ...(first ? { class: "pd-note--first-end" } : {}) }));
  });
  if (!ends) decos.push(Decoration.node(box.pos, box.pos + box.node.nodeSize, { class: "pd-notes--no-end" }));
  return DecorationSet.create(doc, decos);
}

export const NotesSync = Extension.create({
  name: "notesSync",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: notesKey,
        state: {
          init: (_c, state) => numberDecos(state.doc),
          apply: (tr, value, old, state) => (tr.docChanged ? (notesOf(old.doc) || notesOf(state.doc) ? numberDecos(state.doc) : DecorationSet.empty) : value),
        },
        props: { decorations: (state) => notesKey.getState(state) },
        appendTransaction: (trs, old, state) => (trs.some((t) => t.docChanged) && touchesNotes(trs, old.doc) ? fixNotes(state) : null),
      }),
    ];
  },
});
