/**
 * Places a document can point to (U52, U53): headings and bookmarks, found by one resolver that links,
 * cross-references and the contents all read.
 */
import { mergeAttributes, Node, type JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

export const newBookmarkId = () => `bm-${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

/** A named place in the text (Insert > Bookmark…). Takes no room; non-printing characters show it as a flag. */
export const Bookmark = Node.create({
  name: "bookmark",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    id: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute("id"), renderHTML: (a: Record<string, unknown>) => (a.id ? { id: a.id } : {}) },
    name: { default: "", parseHTML: (el: HTMLElement) => el.getAttribute("data-name") ?? "", renderHTML: (a: Record<string, unknown>) => ({ "data-name": a.name }) },
  }),
  parseHTML: () => [{ tag: 'span[data-type="bookmark"]', priority: 60 }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { "data-type": "bookmark", class: "pd-bookmark" })],
  renderText: () => "",
});

export type AnchorKind = "heading" | "bookmark";

export interface Anchor {
  id: string;
  kind: AnchorKind;
  /** What a list shows: a heading's text or a bookmark's name. */
  label: string;
  /** Heading level (headings only). */
  level?: number;
  /** Position in the document (from a live document only). */
  pos?: number;
}

/** Every place in a live document a link can go, in document order. */
export function anchorsOf(doc: PMNode): Anchor[] {
  const out: Anchor[] = [];
  doc.descendants((n, pos) => {
    const t = n.type.name;
    if (t === "heading" && n.attrs.id) out.push({ id: String(n.attrs.id), kind: "heading", label: n.textContent.trim(), level: Number(n.attrs.level), pos });
    else if (t === "bookmark" && n.attrs.id) out.push({ id: String(n.attrs.id), kind: "bookmark", label: String(n.attrs.name || n.attrs.id), pos });
    return t !== "tableOfContents" && t !== "notes";
  });
  return out;
}

/** The same from stored content (exports). */
export function anchorsOfJSON(content: JSONContent): Anchor[] {
  const out: Anchor[] = [];
  const text = (n: JSONContent): string => (n.type === "text" ? (n.text ?? "") : (n.content ?? []).map(text).join(""));
  const walk = (n: JSONContent) => {
    if (n.type === "notes" || n.type === "tableOfContents") return;
    if (n.type === "heading" && n.attrs?.id) out.push({ id: String(n.attrs.id), kind: "heading", label: text(n).trim(), level: Number(n.attrs.level ?? 1) });
    else if (n.type === "bookmark" && n.attrs?.id) out.push({ id: String(n.attrs.id), kind: "bookmark", label: String(n.attrs.name || n.attrs.id) });
    n.content?.forEach(walk);
  };
  walk(content);
  return out;
}

/** A bookmark's first name: the next few words of the text (Word asks; Docs names it from the text). */
export function bookmarkName(textAfter: string, textBefore = ""): string {
  const words = (textAfter.trim() || textBefore.trim().split(/\s+/).slice(-4).join(" ")).split(/\s+/).filter(Boolean).slice(0, 4);
  return words.join(" ").replace(/[.,;:!?]+$/, "").slice(0, 40) || "Bookmark";
}

/**
 * A Word bookmark name for an anchor: letters, digits and underscores, starting with a letter, at most 40
 * characters; headings get Word's hidden kind (a leading underscore).
 */
export function wordBookmarkName(a: Pick<Anchor, "id" | "kind" | "label">, taken: Set<string>): string {
  const base =
    a.kind === "heading"
      ? `_pd_${a.id.replace(/[^A-Za-z0-9_]/g, "_")}`
      : (() => {
          const s = a.label.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
          return /^[A-Za-z]/.test(s) ? s : `B_${s}`;
        })();
  let name = base.slice(0, 40);
  for (let i = 2; taken.has(name); i++) name = `${base.slice(0, 36)}_${i}`;
  taken.add(name);
  return name;
}