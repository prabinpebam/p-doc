/**
 * What changed between two versions (U29): blocks are aligned by their text, and changed text blocks
 * get a word diff that keeps formatting. The result is one document: removed text carries a
 * `deletion` mark and added text an `insertion` mark (id "diff"), shown read-only.
 */
import type { JSONContent } from "@tiptap/core";
import { nodeText } from "./outline.ts";

type Mark = NonNullable<JSONContent["marks"]>[number];

export const DIFF_ID = "diff";
const TEXTBLOCK = new Set(["paragraph", "heading", "codeBlock"]);

/** Longest-common-subsequence alignment: pairs [i, j] of equal items, in order. */
export function align<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): [number, number][] {
  let s = 0;
  while (s < a.length && s < b.length && eq(a[s]!, b[s]!)) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && eq(a[ea - 1]!, b[eb - 1]!)) {
    ea--;
    eb--;
  }
  const pairs: [number, number][] = [];
  for (let i = 0; i < s; i++) pairs.push([i, i]);
  const n = ea - s;
  const m = eb - s;
  if (n > 0 && m > 0 && n * m <= 4_000_000) {
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = eq(a[s + i]!, b[s + j]!) ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (eq(a[s + i]!, b[s + j]!)) {
        pairs.push([s + i, s + j]);
        i++;
        j++;
      } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
      else j++;
    }
  }
  for (let k = 0; k < a.length - ea; k++) pairs.push([ea + k, eb + k]);
  return pairs;
}

const diffMark = (kind: "insertion" | "deletion"): Mark => ({ type: kind, attrs: { id: DIFF_ID, author: "", time: "" } });

function withMark(marks: Mark[] | undefined, kind: "insertion" | "deletion"): Mark[] {
  return [...(marks ?? []).filter((m) => m.type !== "insertion" && m.type !== "deletion"), diffMark(kind)];
}

/** Marks every text in a node as added or removed. */
export function markAll(node: JSONContent, kind: "insertion" | "deletion"): JSONContent {
  if (node.type === "text") return { ...node, marks: withMark(node.marks, kind) };
  if (!node.content) return node;
  return { ...node, content: node.content.map((c) => markAll(c, kind)) };
}

interface Token {
  key: string;
  node: JSONContent;
}

function tokens(block: JSONContent): Token[] {
  const out: Token[] = [];
  for (const n of block.content ?? []) {
    if (n.type === "text") {
      for (const w of (n.text ?? "").match(/\s+|[^\s]+/g) ?? []) out.push({ key: w, node: { ...n, text: w } });
    } else out.push({ key: `\u0000${n.type}:${JSON.stringify(n.attrs ?? {})}`, node: n });
  }
  return out;
}

const sameMarks = (a?: Mark[], b?: Mark[]) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

function compact(nodes: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (last && last.type === "text" && n.type === "text" && sameMarks(last.marks, n.marks)) out[out.length - 1] = { ...last, text: (last.text ?? "") + (n.text ?? "") };
    else out.push(n);
  }
  return out;
}

function diffInline(a: JSONContent, b: JSONContent): JSONContent {
  const ta = tokens(a);
  const tb = tokens(b);
  const pairs = align(ta, tb, (x, y) => x.key === y.key);
  const out: JSONContent[] = [];
  let i = 0;
  let j = 0;
  const flush = (ui: number, uj: number) => {
    for (; i < ui; i++) out.push(ta[i]!.node.type === "text" ? { ...ta[i]!.node, marks: withMark(ta[i]!.node.marks, "deletion") } : ta[i]!.node);
    for (; j < uj; j++) out.push(tb[j]!.node.type === "text" ? { ...tb[j]!.node, marks: withMark(tb[j]!.node.marks, "insertion") } : tb[j]!.node);
  };
  for (const [pi, pj] of pairs) {
    flush(pi, pj);
    out.push(tb[pj]!.node);
    i = pi + 1;
    j = pj + 1;
  }
  flush(ta.length, tb.length);
  const content = compact(out);
  return { ...b, ...(content.length ? { content } : { content: undefined }) };
}

const signature = (n: JSONContent) => `${n.type}\u0001${n.type === "heading" ? n.attrs?.level : ""}\u0001${nodeText(n)}`;

/** Children of two nodes, merged with the differences marked. */
export function diffNodes(a: JSONContent[], b: JSONContent[]): JSONContent[] {
  const pairs = align(a, b, (x, y) => signature(x) === signature(y));
  const out: JSONContent[] = [];
  let i = 0;
  let j = 0;
  const gap = (ui: number, uj: number) => {
    const olds = a.slice(i, ui);
    const news = b.slice(j, uj);
    const k = Math.min(olds.length, news.length);
    for (let x = 0; x < k; x++) {
      const o = olds[x]!;
      const n = news[x]!;
      if (o.type === n.type && TEXTBLOCK.has(o.type!)) out.push(diffInline(o, n));
      else if (o.type === n.type && o.content && n.content) out.push({ ...n, content: diffNodes(o.content, n.content) });
      else out.push(markAll(o, "deletion"), markAll(n, "insertion"));
    }
    for (const o of olds.slice(k)) out.push(markAll(o, "deletion"));
    for (const n of news.slice(k)) out.push(markAll(n, "insertion"));
    i = ui;
    j = uj;
  };
  for (const [pi, pj] of pairs) {
    gap(pi, pj);
    out.push(b[pj]!);
    i = pi + 1;
    j = pj + 1;
  }
  gap(a.length, b.length);
  return out;
}

/** The newer document with what changed since the older one marked. */
export function diffContent(older: JSONContent, newer: JSONContent): JSONContent {
  return { ...newer, content: diffNodes(older.content ?? [], newer.content ?? []) };
}

/** Counts of added and removed words in a diffed document. */
export function diffStats(diffed: JSONContent): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  const walk = (n: JSONContent) => {
    if (n.type === "text") {
      const words = (n.text ?? "").split(/\s+/).filter(Boolean).length;
      if (n.marks?.some((m) => m.type === "insertion" && m.attrs?.id === DIFF_ID)) added += words;
      if (n.marks?.some((m) => m.type === "deletion" && m.attrs?.id === DIFF_ID)) removed += words;
    }
    n.content?.forEach(walk);
  };
  walk(diffed);
  return { added, removed };
}
