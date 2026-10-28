/** Headings, sections and the outline, over document JSON and ProseMirror documents. */
import type { JSONContent } from "@tiptap/core";

/** The plain text of a JSON node. */
export function nodeText(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "tab") return "\t";
  return (node.content ?? []).map(nodeText).join("");
}

export interface Heading {
  /** Index among the document's top-level blocks. */
  index: number;
  level: number;
  text: string;
  id: string | null;
}

/** Top-level headings in order. */
export function headings(doc: JSONContent): Heading[] {
  const out: Heading[] = [];
  (doc.content ?? []).forEach((b, index) => {
    if (b.type === "heading") out.push({ index, level: Number(b.attrs?.level ?? 1), text: nodeText(b).trim(), id: (b.attrs?.id as string) ?? null });
  });
  return out;
}

/** The blocks a heading owns: from it up to the next heading of the same or a higher level. [start, end) */
export function sectionRange(levels: (number | null)[], index: number): [number, number] {
  const level = levels[index];
  if (level == null) return [index, index + 1];
  let end = index + 1;
  while (end < levels.length) {
    const l = levels[end];
    if (l != null && l <= level) break;
    end++;
  }
  return [index, end];
}

/** Block levels: a heading's level, or null for any other block. */
export function blockLevels(doc: JSONContent): (number | null)[] {
  return (doc.content ?? []).map((b) => (b.type === "heading" ? Number(b.attrs?.level ?? 1) : null));
}

/**
 * Moves the section of the heading at `from` so it starts where block `to` is now (before it);
 * `to` may equal the block count to move it to the end. A target inside the section is a no-op.
 */
export function moveSection(doc: JSONContent, from: number, to: number): JSONContent {
  const blocks = doc.content ?? [];
  const [start, end] = sectionRange(blockLevels(doc), from);
  if (to >= start && to <= end) return doc;
  const moving = blocks.slice(start, end);
  const rest = [...blocks.slice(0, start), ...blocks.slice(end)];
  const at = to > end ? to - (end - start) : to;
  return { ...doc, content: [...rest.slice(0, at), ...moving, ...rest.slice(at)] };
}

export interface OutlineItem extends Heading {
  hasChildren: boolean;
}

/** Outline rows, each knowing whether deeper headings follow it before a sibling. */
export function outline(doc: JSONContent): OutlineItem[] {
  const hs = headings(doc);
  return hs.map((h, i) => ({ ...h, hasChildren: i + 1 < hs.length && hs[i + 1]!.level > h.level }));
}

/** Rows visible when the given heading indexes are collapsed. */
export function visibleOutline(items: OutlineItem[], collapsed: ReadonlySet<number>): OutlineItem[] {
  const out: OutlineItem[] = [];
  let hideBelow: number | null = null;
  for (const it of items) {
    if (hideBelow != null && it.level > hideBelow) continue;
    hideBelow = null;
    out.push(it);
    if (collapsed.has(it.index)) hideBelow = it.level;
  }
  return out;
}
