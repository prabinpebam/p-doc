/** Editor operations on blocks: paragraph attributes, styles, indent, outline jumps and section moves. */
import type { Editor } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { moveSection, styleKeyOf, TEXTBLOCKS, type StyleDef, type StyleKey, type Styles } from "@p-doc/core";

const isTextblockType = (name: string) => (TEXTBLOCKS as readonly string[]).includes(name);

/**
 * Inserts a block that holds no text (page break, table of contents) and leaves the cursor in the
 * text block after it, making an empty paragraph when there is none, so typing carries straight on.
 */
export function insertAtomBlock(editor: Editor, type: string): void {
  editor
    .chain()
    .focus()
    .insertContent({ type })
    .command(({ tr, dispatch }) => {
      if (!dispatch) return true;
      const sel = tr.selection;
      // Already in the text block that follows (a paragraph split around the break).
      if (sel.empty && sel.$from.parent.isTextblock) return true;
      const { $to } = sel;
      if ($to.nodeAfter?.isTextblock) tr.setSelection(TextSelection.create(tr.doc, $to.pos + 1));
      else {
        tr.insert($to.pos, editor.schema.nodes.paragraph!.create());
        tr.setSelection(TextSelection.create(tr.doc, $to.pos + 1));
      }
      tr.scrollIntoView();
      return true;
    })
    .run();
}

/** Sets attributes on every paragraph and heading the selection touches, in one step. */
export function setBlockAttrs(editor: Editor, attrs: Record<string, unknown> | ((a: Record<string, unknown>) => Record<string, unknown>)): void {
  const { state } = editor;
  const tr = state.tr;
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!isTextblockType(node.type.name)) return true;
    const next = typeof attrs === "function" ? attrs(node.attrs) : attrs;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next });
    return false;
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

/** The paragraph or heading at the start of the selection. */
export function currentBlock(editor: Editor): PMNode | null {
  const $from = editor.state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (isTextblockType(n.type.name)) return n;
  }
  return null;
}

export function currentStyle(editor: Editor): StyleKey | "quote" | "code" | null {
  if (editor.isActive("codeBlock")) return "code";
  if (editor.isActive("blockquote")) return "quote";
  const b = currentBlock(editor);
  return b ? styleKeyOf(b.type.name, b.attrs) : null;
}

export function applyStyle(editor: Editor, key: StyleKey | "quote" | "code"): void {
  const chain = editor.chain().focus();
  if (key === "quote") return void chain.toggleBlockquote().run();
  if (key === "code") return void chain.toggleCodeBlock().run();
  if (editor.isActive("codeBlock")) chain.toggleCodeBlock();
  if (key.startsWith("heading")) {
    chain.setHeading({ level: Number(key.slice(7)) as 1 | 2 | 3 | 4 }).run();
    return setBlockAttrs(editor, { textStyle: null });
  }
  chain.setParagraph().run();
  setBlockAttrs(editor, { textStyle: key === "normal" ? null : key });
}

const pt = (v: unknown): number | null => {
  if (typeof v !== "string") return null;
  const m = /^([\d.]+)(pt|px)?$/.exec(v.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "px" ? Math.round(n * 0.75 * 2) / 2 : n;
};

/** The selection's look as a style: direct formatting over the block's current style. */
export function styleFromSelection(editor: Editor, styles: Styles): { key: StyleKey; def: StyleDef } | null {
  const block = currentBlock(editor);
  if (!block) return null;
  const key = styleKeyOf(block.type.name, block.attrs);
  if (!key) return null;
  const base = styles[key];
  const ts = editor.getAttributes("textStyle") as Record<string, unknown>;
  const def: StyleDef = {
    ...base,
    fontFamily: typeof ts.fontFamily === "string" && ts.fontFamily ? ts.fontFamily : base.fontFamily,
    fontSize: pt(ts.fontSize) ?? base.fontSize,
    color: typeof ts.color === "string" && ts.color ? ts.color : base.color,
    bold: editor.isActive("bold") || base.bold,
    italic: editor.isActive("italic") || base.italic,
    lineHeight: block.attrs.lineHeight ? Number(block.attrs.lineHeight) : base.lineHeight,
    spaceBefore: block.attrs.spaceBefore ?? base.spaceBefore,
    spaceAfter: block.attrs.spaceAfter ?? base.spaceAfter,
  };
  return { key, def };
}

/** Removes the selection block's direct formatting, so it shows its (just updated) style. */
export function clearBlockDirectFormatting(editor: Editor): void {
  const { state } = editor;
  const $from = state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (!isTextblockType(n.type.name)) continue;
    const start = $from.before(d);
    const tr = state.tr;
    const marks = ["textStyle", "bold", "italic"].map((m) => state.schema.marks[m]).filter(Boolean);
    for (const m of marks) tr.removeMark(start + 1, start + 1 + n.content.size, m);
    tr.setNodeMarkup(start, undefined, { ...n.attrs, lineHeight: null, spaceBefore: null, spaceAfter: null });
    editor.view.dispatch(tr);
    return;
  }
}

/** Indent: list items nest; other blocks move by half an inch (0–8 steps). */
export function indent(editor: Editor, dir: 1 | -1): void {
  if (editor.isActive("listItem") || editor.isActive("taskItem")) {
    const type = editor.isActive("taskItem") ? "taskItem" : "listItem";
    if (dir > 0) editor.chain().focus().sinkListItem(type).run();
    else editor.chain().focus().liftListItem(type).run();
    return;
  }
  setBlockAttrs(editor, (a) => ({ indent: Math.max(0, Math.min(8, Number(a.indent ?? 0) + dir)) }));
}

/** Top-level block index → document position. */
export function blockPos(doc: PMNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index && i < doc.childCount; i++) pos += doc.child(i).nodeSize;
  return pos;
}

/** Puts the cursor at the end of a top-level block and scrolls it to the top of the view. */
export function jumpToBlock(editor: Editor, index: number): void {
  const { doc } = editor.state;
  if (index >= doc.childCount) return;
  const pos = blockPos(doc, index);
  const end = pos + doc.child(index).nodeSize - 1;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(doc.resolve(end), -1)));
  editor.view.focus();
  const dom = editor.view.nodeDOM(pos);
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "start" });
}

/** Moves a heading's section in one undoable step (see core's moveSection). */
export function moveHeadingSection(editor: Editor, from: number, to: number): boolean {
  const json = editor.getJSON();
  const moved = moveSection(json, from, to);
  if (moved === json) return false;
  const next = PMNode.fromJSON(editor.schema, moved);
  const { state } = editor;
  editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, next.content).scrollIntoView());
  return true;
}

/** The index of the top-level block holding the cursor. */
export function cursorBlockIndex(editor: Editor): number {
  return editor.state.selection.$from.index(0);
}
