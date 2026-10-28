/**
 * Compare documents (U66): the revised document with every difference from the original as a
 * suggestion, so accepting all gives the revised text and rejecting all the original, exactly.
 *
 * Blocks are aligned by their type and text. A changed paragraph or heading gets a word diff whose
 * removed and added runs are `deletion` and `insertion` marks (formatting counts: a word made bold
 * is removed plain and added bold), and a paragraph whose style or paragraph formatting changed gets
 * a `formatChange`. Containers with the same settings (lists, quotes, tables, rows, notes) are
 * compared inside; anything else is removed and added whole through the `blockChange` attribute.
 * Both documents are read as they would be with their own suggestions accepted. Comments come from
 * the revised document.
 */
import type { JSONContent } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { align } from "./diff.ts";
import { nodeText } from "./outline.ts";
import { BLOCK_CHANGE_TYPES, schema as pdocSchema } from "./schema.ts";
import { acceptAll } from "./suggestions.ts";

type Mark = NonNullable<JSONContent["marks"]>[number];
type Attrs = Record<string, unknown>;

export interface CompareOptions {
  /** Shown as the author of every suggestion ("Comparison"). */
  author: string;
  /** ISO time stamped on every suggestion. */
  time: string;
  /** A new suggestion id; defaults to `s-` and random letters. */
  id?: () => string;
}

/** A whole block suggested for adding or removing (`blockChange` on the node). */
export interface BlockChange {
  kind: "insertion" | "deletion";
  id: string;
  author: string;
  time: string;
}

const BLOCKS = new Set<string>(BLOCK_CHANGE_TYPES);
/** Blocks whose words are compared, with formatChange for their style. */
const WORDED = new Set(["paragraph", "heading"]);
/** Review state, never part of what is compared. */
const REVIEW_ATTRS = new Set(["split", "join", "formatChange", "blockChange"]);

const randomId = () => `s-${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

const stable = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Attrs;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
};

const cleanAttrs = (a: Attrs | undefined): Attrs => Object.fromEntries(Object.entries(a ?? {}).filter(([k]) => !REVIEW_ATTRS.has(k)));
const ownMarks = (marks: Mark[] | undefined) => (marks ?? []).filter((m) => m.type !== "comment");
const withoutComments = (marks: Mark[] | undefined) => {
  const m = ownMarks(marks);
  return m.length ? m : undefined;
};

/** The node with no comment marks anywhere in it (removed text comes from the original). */
function stripComments(n: JSONContent): JSONContent {
  const out: JSONContent = { ...n };
  if (n.marks) {
    const m = withoutComments(n.marks);
    if (m) out.marks = m;
    else delete out.marks;
  }
  if (n.content) out.content = n.content.map(stripComments);
  return out;
}

/** Everything that matters about a node, for "is it the same". */
const key = (n: JSONContent): string => `${n.type}${stable(cleanAttrs(n.attrs))}${stable(ownMarks(n.marks))}${n.text ?? ""}[${(n.content ?? []).map(key).join(",")}]`;
const signature = (n: JSONContent) => `${n.type}\u0001${n.type === "heading" ? n.attrs?.level : ""}\u0001${nodeText(n)}`;
const wordsOf = (n: JSONContent) => nodeText(n).toLowerCase().split(/\s+/).filter(Boolean);

/** Whether two unaligned blocks are one block changed, rather than one removed and another added. */
function alike(o: JSONContent, n: JSONContent): boolean {
  const worded = WORDED.has(o.type!) && WORDED.has(n.type!);
  if (!worded) return o.type === n.type;
  const a = wordsOf(o);
  const b = wordsOf(n);
  if (!a.length || !b.length) return true;
  const seen = new Set(a);
  const common = b.filter((w) => seen.has(w)).length;
  return common / Math.max(a.length, b.length) >= 0.4;
}

class Comparer {
  constructor(private readonly o: Required<CompareOptions>) {}

  private info(id: string) {
    return { id, author: this.o.author, time: this.o.time };
  }

  private mark(kind: "insertion" | "deletion", id: string, marks: Mark[] | undefined): Mark[] {
    return [...(marks ?? []).filter((m) => m.type !== "insertion" && m.type !== "deletion"), { type: kind, attrs: this.info(id) }];
  }

  private whole(n: JSONContent, kind: BlockChange["kind"], id: string): JSONContent {
    const b: BlockChange = { kind, ...this.info(id) };
    return { ...(kind === "deletion" ? stripComments(n) : n), attrs: { ...(n.attrs ?? {}), blockChange: b } };
  }

  /** Children of two nodes merged, with the differences as suggestions. */
  nodes(a: JSONContent[], b: JSONContent[]): JSONContent[] {
    const pairs = align(a, b, (x, y) => signature(x) === signature(y));
    const out: JSONContent[] = [];
    let i = 0;
    let j = 0;
    const gap = (ui: number, uj: number) => {
      const olds = a.slice(i, ui);
      const news = b.slice(j, uj);
      i = ui;
      j = uj;
      // Blocks with the same text (a paragraph made a heading) pair first; between them, blocks pair
      // in order while they look alike, and the rest are removed or added whole.
      let x = 0;
      let y = 0;
      const between = (ux: number, uy: number) => {
        while (x < ux || y < uy) {
          const o = olds[x];
          const n = news[y];
          if (o && n && alike(o, n)) {
            out.push(...this.pair(o, n));
            x++;
            y++;
          } else if (o && (!n || ux - x >= uy - y)) {
            out.push(this.removed(o));
            x++;
          } else if (n) {
            out.push(this.added(n));
            y++;
          }
        }
      };
      for (const [px, py] of align(olds, news, (p, q) => nodeText(p) !== "" && nodeText(p) === nodeText(q))) {
        between(px, py);
        out.push(...this.pair(olds[px]!, news[py]!));
        x = px + 1;
        y = py + 1;
      }
      between(olds.length, news.length);
    };
    for (const [pi, pj] of pairs) {
      gap(pi, pj);
      out.push(...this.pair(a[pi]!, b[pj]!));
      i = pi + 1;
      j = pj + 1;
    }
    gap(a.length, b.length);
    return out;
  }

  private removed(o: JSONContent): JSONContent {
    return this.whole(o, "deletion", this.o.id());
  }

  private added(n: JSONContent): JSONContent {
    return this.whole(n, "insertion", this.o.id());
  }

  private replaced(o: JSONContent, n: JSONContent): JSONContent[] {
    const id = this.o.id();
    return [this.whole(o, "deletion", id), this.whole(n, "insertion", id)];
  }

  /** One original block against one revised block. */
  private pair(o: JSONContent, n: JSONContent): JSONContent[] {
    if (key(o) === key(n)) return [n];
    if (!BLOCKS.has(o.type!) || !BLOCKS.has(n.type!)) return [n];
    if (WORDED.has(o.type!) && WORDED.has(n.type!)) {
      const oa = cleanAttrs(o.attrs);
      const na = cleanAttrs(n.attrs);
      const out = this.words(o, n);
      if (o.type !== n.type || stable(oa) !== stable(na)) {
        // A heading's anchor goes back with it; a paragraph has none.
        const { id, ...old } = oa;
        if (o.type === "heading") old.id = id ?? null;
        out.attrs = { ...(out.attrs ?? {}), formatChange: { ...this.info(this.o.id()), old: { type: o.type, attrs: old } } };
      }
      return [out];
    }
    if (o.type === n.type && o.content && n.content && stable(cleanAttrs(o.attrs)) === stable(cleanAttrs(n.attrs)) && o.type !== "codeBlock") {
      if (o.type === "tableRow") {
        // Cells pair by place; a row whose cells differ in number or settings changes whole.
        const oc = o.content;
        const nc = n.content;
        if (oc.length !== nc.length || oc.some((c, x) => c.type !== nc[x]!.type || stable(cleanAttrs(c.attrs)) !== stable(cleanAttrs(nc[x]!.attrs)))) return this.replaced(o, n);
        return [{ ...n, content: nc.map((c, x) => ({ ...c, content: this.nodes(oc[x]!.content ?? [], c.content ?? []) })) }];
      }
      return [{ ...n, content: this.nodes(o.content, n.content) }];
    }
    return this.replaced(o, n);
  }

  /** A paragraph or heading: the revised block with removed and added words marked. */
  private words(a: JSONContent, b: JSONContent): JSONContent {
    const ta = tokens(a);
    const tb = tokens(b);
    const pairs = align(ta, tb, (x, y) => x.key === y.key);
    const out: JSONContent[] = [];
    let i = 0;
    let j = 0;
    const flush = (ui: number, uj: number) => {
      if (i === ui && j === uj) return;
      const id = this.o.id();
      for (; i < ui; i++) {
        const t = stripComments(ta[i]!.node);
        out.push({ ...t, marks: this.mark("deletion", id, t.marks) });
      }
      for (; j < uj; j++) out.push({ ...tb[j]!.node, marks: this.mark("insertion", id, tb[j]!.node.marks) });
    };
    for (const [pi, pj] of pairs) {
      flush(pi, pj);
      out.push(tb[pj]!.node);
      i = pi + 1;
      j = pj + 1;
    }
    flush(ta.length, tb.length);
    const content = compact(out);
    const res: JSONContent = { ...b };
    if (content.length) res.content = content;
    else delete res.content;
    return res;
  }
}

interface Token {
  key: string;
  node: JSONContent;
}

/** Words and spaces (with their formatting) and inline objects, as comparable tokens. */
function tokens(block: JSONContent): Token[] {
  const out: Token[] = [];
  for (const n of block.content ?? []) {
    const marks = stable(ownMarks(n.marks));
    if (n.type === "text") {
      for (const w of (n.text ?? "").match(/\s+|[^\s]+/g) ?? []) out.push({ key: `${marks}\u0000${w}`, node: { ...n, text: w } });
    } else out.push({ key: `${marks}\u0001${n.type}:${stable(n.attrs ?? {})}`, node: n });
  }
  return out;
}

function compact(nodes: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (last && last.type === "text" && n.type === "text" && stable(last.marks ?? []) === stable(n.marks ?? [])) out[out.length - 1] = { ...last, text: (last.text ?? "") + (n.text ?? "") };
    else out.push(n);
  }
  return out;
}

/**
 * The revised document with every difference from the original as a suggestion by `author`. Accept
 * all gives the revised content, reject all the original (both read with their own suggestions
 * accepted, and without the original's comments).
 */
export function compareDocuments(original: JSONContent, revised: JSONContent, options: CompareOptions, schema: Schema = pdocSchema()): JSONContent {
  const a = acceptAll(normal(original, schema));
  const b = acceptAll(normal(revised, schema));
  const c = new Comparer({ id: randomId, ...options });
  return { ...b, content: c.nodes(a.content ?? [], b.content ?? []) };
}

/** The content as the schema reads it: every attribute present, text joined. */
const normal = (content: JSONContent, schema: Schema): JSONContent => schema.nodeFromJSON(content).toJSON() as JSONContent;

/** The title of the comparison document. */
export const comparisonTitle = (original: string, revised: string) => `Comparison of ${original || "Untitled"} and ${revised || "Untitled"}`;
