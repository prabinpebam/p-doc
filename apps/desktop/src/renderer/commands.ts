/**
 * Every command in one registry: the menus, command search (Alt+/), the shortcuts list (Ctrl+/) and the
 * keyboard handler all read it, so a command is reachable from each the same way (PD3, U11).
 */
import type { Editor } from "@tiptap/core";
import { defaultStyles, STYLE_LABELS, TEXT_WIDTH, type PageSetup, type StyleKey, type TextWidth } from "@p-doc/core";
import type { Theme } from "../shared/api.ts";
import { applyStyle, clearBlockDirectFormatting, currentStyle, indent, insertAtomBlock, setBlockAttrs, currentBlock, styleFromSelection } from "./editor/blocks.ts";
import { copyDoc, deleteDoc } from "./ops.ts";
import { downloadAs, downloadPdf, openFromFile, printDoc } from "./output.ts";
import { flush, getEditor, newDoc, syncSelection, updateDoc } from "./session.ts";
import { app, openDialog, showPanel, shownPanel, toast, togglePanel, updateSettings } from "./state.ts";
import { nameCurrent, toggleHistory } from "./versions.ts";
import { syncNow } from "./sync.ts";
import { canDecide, decideAll, MARKUP_NAMES, MODE_NAMES, setMarkup, setMode, startComment, step, toggleReview } from "./review.ts";
import type { Markup, Mode } from "./state.ts";

export interface Command {
  id: string;
  label: string;
  /** Words command search also matches. */
  keywords?: string;
  /** Chords the keyboard handler runs this for; the first is shown. */
  keys?: string[];
  /** A chord shown but left to the system (clipboard). */
  hint?: string;
  run: () => void;
  enabled?: () => boolean;
  checked?: () => boolean;
  /** Runs even when focus is in a text field outside the page. */
  global?: boolean;
}

export type MenuEntry = string | "-" | { label: string; items: MenuEntry[] };
export interface Menu {
  id: string;
  label: string;
  /** Alt+<key> opens it. */
  key: string;
  items: MenuEntry[];
}

const ed = () => getEditor();
const hasEditor = () => !!getEditor();
/** The page takes changes: not in Viewing, a read-only markup view or over a version. */
const canEdit = () => !!getEditor()?.isEditable;
const hasDoc = () => !!app.get().doc;
const setPage = (patch: Partial<PageSetup>) => {
  const d = app.get().doc;
  if (d && Object.entries(patch).some(([k, v]) => d.page[k as keyof PageSetup] !== v)) updateDoc({ page: { ...d.page, ...patch } });
};
const withEditor = (fn: (e: Editor) => void) => () => {
  const e = ed();
  if (e) fn(e);
};
const chain = (fn: (c: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => withEditor((e) => void fn(e.chain().focus()).run());

const FONT_STEPS = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96];

/** The font size at the cursor in points: direct size, else the block's style size. */
export function fontSizeAt(e: Editor): number {
  const v = e.getAttributes("textStyle").fontSize as string | undefined;
  const m = v ? /^([\d.]+)(pt|px)?$/.exec(v) : null;
  if (m) return m[2] === "px" ? Number(m[1]) * 0.75 : Number(m[1]);
  const key = styleKeyAt(e);
  const doc = app.get().doc;
  return key && doc ? doc.styles[key].fontSize : 11;
}
const styleKeyAt = (e: Editor): StyleKey | null => {
  const s = currentStyle(e);
  return s === "quote" || s === "code" ? "normal" : s;
};

export function setFontSize(e: Editor, size: number): void {
  const n = Math.max(1, Math.min(400, Math.round(size * 2) / 2));
  e.chain().focus().setFontSize(`${n}pt`).run();
}
const stepFont = (dir: 1 | -1) =>
  withEditor((e) => {
    const cur = fontSizeAt(e);
    setFontSize(e, dir > 0 ? cur + 1 : Math.max(1, cur - 1));
  });

export const ZOOMS = [50, 75, 90, 100, 125, 150, 200];
const zoomBy = (dir: 1 | -1) => () => {
  const z = app.get().settings?.zoom ?? 100;
  const next = dir > 0 ? (ZOOMS.find((v) => v > z) ?? z) : ([...ZOOMS].reverse().find((v) => v < z) ?? z);
  void updateSettings({ zoom: next });
};

const LINE_SPACINGS: [string, number][] = [
  ["Single", 1],
  ["1.15", 1.15],
  ["1.5", 1.5],
  ["Double", 2],
];

const lineHeightAt = (e: Editor): number => {
  const b = currentBlock(e);
  const key = styleKeyAt(e);
  const doc = app.get().doc;
  return b?.attrs.lineHeight ? Number(b.attrs.lineHeight) : key && doc ? doc.styles[key].lineHeight : 1.15;
};
const spaceAt = (e: Editor, which: "spaceBefore" | "spaceAfter"): number => {
  const b = currentBlock(e);
  const key = styleKeyAt(e);
  const doc = app.get().doc;
  return b?.attrs[which] != null ? Number(b.attrs[which]) : key && doc ? doc.styles[key][which] : 0;
};

const STYLE_KEYS_MENU: (StyleKey | "quote" | "code")[] = ["normal", "title", "subtitle", "heading1", "heading2", "heading3", "heading4", "quote", "code"];
export const STYLE_NAMES: Record<StyleKey | "quote" | "code", string> = { ...STYLE_LABELS, quote: "Quote", code: "Code" };

function updateStyleToMatch(): void {
  const e = ed();
  const doc = app.get().doc;
  if (!e || !doc) return;
  const r = styleFromSelection(e, doc.styles);
  if (!r) return;
  updateDoc({ styles: { ...doc.styles, [r.key]: r.def } });
  clearBlockDirectFormatting(e);
  toast(`Updated ${STYLE_LABELS[r.key]} to match`);
}

const commands: Command[] = [
  // File
  { id: "file.new", label: "New", keys: ["Ctrl+N"], run: () => void newDoc(), global: true },
  {
    id: "file.library",
    label: "Open library",
    keys: ["Ctrl+O"],
    global: true,
    run: () => {
      showPanel("library");
      app.set({ focus: false });
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#library-search")?.focus());
    },
  },
  { id: "file.copy", label: "Make a copy", run: () => app.get().current && void copyDoc(app.get().current!), enabled: () => !!app.get().current },
  { id: "file.rename", label: "Rename", run: () => document.querySelector<HTMLInputElement>("#doc-title")?.select(), enabled: () => !!app.get().current },
  {
    id: "file.move",
    label: "Move to Public",
    run: () => {
      const c = app.get().current;
      if (c) openDialog({ kind: "move", ref: c, title: c.title, to: c.space === "private" ? "public" : "private" });
    },
    enabled: () => !!app.get().current,
  },
  { id: "file.delete", label: "Delete", run: () => app.get().current && void deleteDoc(app.get().current!), enabled: () => !!app.get().current },
  {
    id: "file.save",
    label: "Save now",
    keywords: "save",
    keys: ["Ctrl+S"],
    global: true,
    run: () => void flush().then(() => app.get().save === "saved" && toast("Saved")),
  },
  { id: "file.settings", label: "Settings", keywords: "preferences options", global: true, run: () => openDialog({ kind: "settings" }) },
  { id: "file.history", label: "See version history", keys: ["Ctrl+Alt+Shift+H"], keywords: "versions revisions restore compare", global: true, run: toggleHistory, enabled: hasDoc },
  {
    id: "file.nameVersion",
    label: "Name current version",
    keywords: "version tag milestone",
    global: true,
    run: () => void nameCurrent(),
    enabled: () => hasDoc() && !!app.get().info?.git,
  },
  {
    id: "file.sync",
    label: "Sync now",
    keys: ["Ctrl+Alt+S"],
    keywords: "github push pull upload",
    global: true,
    run: () => void syncNow(),
    enabled: () => !!app.get().settings?.github?.connected && app.get().sync?.state.kind !== "syncing",
  },
  { id: "file.pageSetup", label: "Page setup…", keywords: "paper margins orientation landscape portrait page colour size", global: true, run: () => openDialog({ kind: "pageSetup" }), enabled: hasDoc },
  { id: "file.pdf", label: "PDF document (.pdf)", keywords: "download export pdf save as", global: true, run: () => void downloadPdf(), enabled: hasEditor },
  { id: "file.docx", label: "Microsoft Word (.docx)", keywords: "download export word docx save as", global: true, run: () => void downloadAs("docx"), enabled: hasEditor },
  { id: "file.md", label: "Markdown (.md)", keywords: "download export markdown md save as", global: true, run: () => void downloadAs("md"), enabled: hasEditor },
  { id: "file.html", label: "Web page (.html)", keywords: "download export html web page save as", global: true, run: () => void downloadAs("html"), enabled: hasEditor },
  { id: "file.txt", label: "Plain text (.txt)", keywords: "download export text txt save as", global: true, run: () => void downloadAs("txt"), enabled: hasEditor },
  { id: "file.openFile", label: "Open from file…", keys: ["Ctrl+Shift+O"], keywords: "import upload word docx markdown html text", global: true, run: () => void openFromFile() },
  { id: "file.print", label: "Print", keys: ["Ctrl+P"], global: true, run: () => void printDoc(), enabled: hasEditor },

  // Edit
  { id: "edit.undo", label: "Undo", keys: ["Ctrl+Z"], run: chain((c) => c.undo()), enabled: () => canEdit() && !!ed()?.can().undo() },
  { id: "edit.redo", label: "Redo", keys: ["Ctrl+Y", "Ctrl+Shift+Z"], run: chain((c) => c.redo()), enabled: () => canEdit() && !!ed()?.can().redo() },
  { id: "edit.cut", label: "Cut", hint: "Ctrl+X", run: () => clip("cut") },
  { id: "edit.copy", label: "Copy", hint: "Ctrl+C", run: () => clip("copy") },
  { id: "edit.paste", label: "Paste", hint: "Ctrl+V", run: () => clip("paste") },
  { id: "edit.pasteText", label: "Paste without formatting", hint: "Ctrl+Shift+V", run: () => clip("pasteAndMatchStyle") },
  { id: "edit.selectAll", label: "Select all", hint: "Ctrl+A", run: chain((c) => c.selectAll()) },
  { id: "edit.find", label: "Find", keys: ["Ctrl+F"], global: true, run: () => openFind("find") },
  { id: "edit.replace", label: "Find and replace", keys: ["Ctrl+H"], global: true, run: () => openFind("replace") },

  // View
  {
    id: "view.outline",
    label: "Show outline",
    keys: ["Ctrl+Alt+A"],
    global: true,
    checked: () => shownPanel(app.get()) === "outline",
    run: () => togglePanel("outline"),
  },
  {
    id: "view.library",
    label: "Show library",
    global: true,
    checked: () => shownPanel(app.get()) === "library",
    run: () => togglePanel("library"),
  },
  { id: "view.history", label: "Version history", keywords: "versions revisions", global: true, checked: () => app.get().history, run: toggleHistory, enabled: hasDoc },
  { id: "view.zoomIn", label: "Zoom in", keys: ["Ctrl+=", "Ctrl+Shift+="], global: true, run: zoomBy(1) },
  { id: "view.zoomOut", label: "Zoom out", keys: ["Ctrl+-"], global: true, run: zoomBy(-1) },
  { id: "view.zoomReset", label: "Actual size", keys: ["Ctrl+0"], global: true, run: () => void updateSettings({ zoom: 100 }) },
  { id: "view.focus", label: "Focus view", keys: ["Ctrl+Alt+Shift+F"], global: true, checked: () => app.get().focus, run: () => app.set((s) => ({ focus: !s.focus })) },
  { id: "view.compact", label: "Compact mode", keys: ["Ctrl+Shift+F"], global: true, checked: () => !!app.get().settings?.compact, run: () => void updateSettings({ compact: !app.get().settings?.compact }) },
  { id: "view.fullScreen", label: "Full screen", keys: ["F11"], global: true, checked: () => app.get().fullscreen, run: () => void window.pdoc.app.toggleFullScreen() },
  { id: "view.pages", label: "Pages", keywords: "print layout page view", global: true, checked: () => app.get().doc?.page.mode === "pages", run: () => setPage({ mode: "pages" }), enabled: hasDoc },
  { id: "view.pageless", label: "Pageless", keywords: "web layout continuous", global: true, checked: () => app.get().doc?.page.mode === "pageless", run: () => setPage({ mode: "pageless" }), enabled: hasDoc },
  ...(Object.keys(TEXT_WIDTH) as TextWidth[]).map(
    (w): Command => ({
      id: `view.width.${w}`,
      label: TEXT_WIDTH[w] ? `${w[0]!.toUpperCase()}${w.slice(1)} (${TEXT_WIDTH[w]} px)` : "Full width",
      keywords: "text width pageless",
      global: true,
      checked: () => app.get().doc?.page.textWidth === w,
      run: () => setPage({ textWidth: w }),
      enabled: () => app.get().doc?.page.mode === "pageless",
    }),
  ),
  ...(["light", "dark", "system"] as Theme[]).map(
    (t): Command => ({
      id: `view.theme.${t}`,
      label: t === "system" ? "System" : t === "light" ? "Light" : "Dark",
      keywords: "appearance theme",
      global: true,
      checked: () => app.get().settings?.theme === t,
      run: () => void updateSettings({ theme: t }),
    }),
  ),

  // Insert
  { id: "insert.image", label: "Image…", keywords: "picture photo", run: () => document.querySelector<HTMLInputElement>("#image-file")?.click(), enabled: canEdit },
  ...[2, 3, 4, 5].map(
    (n): Command => ({ id: `insert.table${n}`, label: `${n} × ${n} table`, keywords: "table grid", run: chain((c) => c.insertTable({ rows: n, cols: n, withHeaderRow: false })), enabled: canEdit }),
  ),
  { id: "insert.link", label: "Link", keys: ["Ctrl+K"], run: () => openDialog({ kind: "link" }), enabled: canEdit },
  { id: "insert.hr", label: "Horizontal line", keywords: "rule divider", run: chain((c) => c.setHorizontalRule()), enabled: canEdit },
  { id: "insert.pageBreak", label: "Page break", keys: ["Ctrl+Enter"], run: withEditor((e) => insertAtomBlock(e, "pageBreak")), enabled: canEdit },
  { id: "insert.toc", label: "Table of contents", keywords: "toc contents", run: withEditor((e) => insertAtomBlock(e, "tableOfContents")), enabled: canEdit },
  { id: "insert.headerFooter", label: "Header and footer", keywords: "page number count footer header", global: true, run: () => openDialog({ kind: "headerFooter" }), enabled: hasDoc },
  { id: "insert.special", label: "Special characters…", keywords: "symbol emoji character", run: () => openDialog({ kind: "specialChars" }), enabled: canEdit },
  { id: "insert.comment", label: "Comment", keys: ["Ctrl+Alt+M"], keywords: "note annotate review", run: startComment, enabled: hasEditor },

  // Format > Text
  { id: "format.bold", label: "Bold", keys: ["Ctrl+B"], run: chain((c) => c.toggleBold()), checked: () => !!ed()?.isActive("bold"), enabled: canEdit },
  { id: "format.italic", label: "Italic", keys: ["Ctrl+I"], run: chain((c) => c.toggleItalic()), checked: () => !!ed()?.isActive("italic"), enabled: canEdit },
  { id: "format.underline", label: "Underline", keys: ["Ctrl+U"], run: chain((c) => c.toggleUnderline()), checked: () => !!ed()?.isActive("underline"), enabled: canEdit },
  { id: "format.strike", label: "Strikethrough", keys: ["Alt+Shift+5"], run: chain((c) => c.toggleStrike()), checked: () => !!ed()?.isActive("strike"), enabled: canEdit },
  { id: "format.sup", label: "Superscript", keys: ["Ctrl+."], run: chain((c) => c.toggleSuperscript()), checked: () => !!ed()?.isActive("superscript"), enabled: canEdit },
  { id: "format.sub", label: "Subscript", keys: ["Ctrl+,"], run: chain((c) => c.toggleSubscript()), checked: () => !!ed()?.isActive("subscript"), enabled: canEdit },
  { id: "format.sizeUp", label: "Increase font size", keys: ["Ctrl+Shift+.", "Ctrl+]"], run: stepFont(1), enabled: canEdit },
  { id: "format.sizeDown", label: "Decrease font size", keys: ["Ctrl+Shift+,", "Ctrl+["], run: stepFont(-1), enabled: canEdit },

  // Format > Paragraph styles
  ...STYLE_KEYS_MENU.map(
    (k): Command => ({
      id: `style.${k}`,
      label: STYLE_NAMES[k],
      keywords: "paragraph style heading",
      keys: k === "normal" ? ["Ctrl+Alt+0"] : k.startsWith("heading") ? [`Ctrl+Alt+${k.slice(7)}`] : undefined,
      run: withEditor((e) => applyStyle(e, k)),
      checked: () => {
        const e = ed();
        return !!e && currentStyle(e) === k;
      },
      enabled: canEdit,
    }),
  ),
  {
    id: "style.update",
    label: "Update style to match",
    keywords: "paragraph style",
    run: updateStyleToMatch,
    enabled: () => {
      const e = ed();
      return !!e && e.isEditable && !!styleKeyAt(e);
    },
  },
  {
    id: "style.reset",
    label: "Reset styles",
    keywords: "paragraph style default",
    run: () => {
      updateDoc({ styles: defaultStyles() });
      toast("Styles reset");
    },
    enabled: () => !!app.get().doc && canEdit(),
  },

  // Format > Align
  { id: "align.left", label: "Left", keywords: "align", keys: ["Ctrl+Shift+L", "Ctrl+L"], run: chain((c) => c.setTextAlign("left")), checked: () => !!ed()?.isActive({ textAlign: "left" }), enabled: canEdit },
  { id: "align.center", label: "Centre", keywords: "align center", keys: ["Ctrl+Shift+E", "Ctrl+E"], run: chain((c) => c.setTextAlign("center")), checked: () => !!ed()?.isActive({ textAlign: "center" }), enabled: canEdit },
  { id: "align.right", label: "Right", keywords: "align", keys: ["Ctrl+Shift+R", "Ctrl+R"], run: chain((c) => c.setTextAlign("right")), checked: () => !!ed()?.isActive({ textAlign: "right" }), enabled: canEdit },
  { id: "align.justify", label: "Justify", keywords: "align", keys: ["Ctrl+Shift+J", "Ctrl+J"], run: chain((c) => c.setTextAlign("justify")), checked: () => !!ed()?.isActive({ textAlign: "justify" }), enabled: canEdit },

  // Format > Indent
  { id: "indent.more", label: "Increase indent", keys: ["Ctrl+M"], run: withEditor((e) => indent(e, 1)), enabled: canEdit },
  { id: "indent.less", label: "Decrease indent", keys: ["Ctrl+Shift+M"], run: withEditor((e) => indent(e, -1)), enabled: canEdit },

  // Format > Line spacing
  ...LINE_SPACINGS.map(
    ([label, v]): Command => ({
      id: `spacing.${v}`,
      label,
      keywords: "line spacing",
      run: withEditor((e) => setBlockAttrs(e, { lineHeight: v })),
      checked: () => {
        const e = ed();
        return !!e && lineHeightAt(e) === v;
      },
      enabled: canEdit,
    }),
  ),
  {
    id: "spacing.before",
    label: "Add space before paragraph",
    keywords: "line spacing",
    run: withEditor((e) => setBlockAttrs(e, { spaceBefore: spaceAt(e, "spaceBefore") > 0 ? 0 : 12 })),
    enabled: canEdit,
  },
  {
    id: "spacing.after",
    label: "Remove space after paragraph",
    keywords: "line spacing",
    run: withEditor((e) => setBlockAttrs(e, { spaceAfter: spaceAt(e, "spaceAfter") > 0 ? 0 : 8 })),
    enabled: canEdit,
  },

  // Format > Lists
  { id: "list.bullets", label: "Bulleted list", keys: ["Ctrl+Shift+8"], run: chain((c) => c.toggleBulletList()), checked: () => !!ed()?.isActive("bulletList"), enabled: canEdit },
  { id: "list.numbers", label: "Numbered list", keys: ["Ctrl+Shift+7"], run: chain((c) => c.toggleOrderedList()), checked: () => !!ed()?.isActive("orderedList"), enabled: canEdit },
  { id: "list.checklist", label: "Checklist", keys: ["Ctrl+Shift+9"], run: chain((c) => c.toggleTaskList()), checked: () => !!ed()?.isActive("taskList"), enabled: canEdit },

  // Format > Table
  ...(
    [
      ["table.rowAbove", "Insert row above", (c) => c.addRowBefore()],
      ["table.rowBelow", "Insert row below", (c) => c.addRowAfter()],
      ["table.colLeft", "Insert column left", (c) => c.addColumnBefore()],
      ["table.colRight", "Insert column right", (c) => c.addColumnAfter()],
      ["table.deleteRow", "Delete row", (c) => c.deleteRow()],
      ["table.deleteCol", "Delete column", (c) => c.deleteColumn()],
      ["table.delete", "Delete table", (c) => c.deleteTable()],
    ] as [string, string, (c: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>][]
  ).map(([id, label, fn]): Command => ({ id, label, keywords: "table", run: chain(fn), enabled: () => canEdit() && !!ed()?.isActive("table") })),

  {
    id: "format.clear",
    label: "Clear formatting",
    keys: ["Ctrl+\\"],
    run: withEditor((e) => {
      e.chain().focus().unsetAllMarks().unsetTextAlign().run();
      setBlockAttrs(e, { lineHeight: null, spaceBefore: null, spaceAfter: null, indent: 0 });
    }),
    enabled: canEdit,
  },

  // Tools
  { id: "tools.wordCount", label: "Word count", keys: ["Ctrl+Shift+C"], global: true, run: () => openDialog({ kind: "wordCount" }), enabled: hasEditor },
  { id: "tools.spelling", label: "Spelling", keywords: "spell check", checked: () => !!app.get().settings?.spelling, run: () => void updateSettings({ spelling: !app.get().settings?.spelling }) },
  { id: "tools.search", label: "Command search", keys: ["Alt+/"], global: true, run: () => app.set((s) => ({ palette: !s.palette })) },

  // Review (spec §4.5)
  ...(
    [
      ["editing", "Ctrl+Alt+Shift+Z", "edit directly"],
      ["suggesting", "Ctrl+Alt+Shift+X", "track changes suggest"],
      ["viewing", "Ctrl+Alt+Shift+C", "read only"],
    ] as [Mode, string, string][]
  ).map(
    ([m, key, words]): Command => ({
      id: `mode.${m}`,
      label: MODE_NAMES[m],
      keywords: `mode ${words}`,
      keys: [key],
      global: true,
      checked: () => app.get().mode === m,
      run: () => setMode(m),
      enabled: hasDoc,
    }),
  ),
  ...(["simple", "all", "none", "original"] as Markup[]).map(
    (m): Command => ({
      id: `view.markup.${m}`,
      label: MARKUP_NAMES[m],
      keywords: "markup suggestions track changes show",
      global: true,
      checked: () => app.get().markup === m,
      run: () => setMarkup(m),
      enabled: hasDoc,
    }),
  ),
  { id: "tools.review", label: "Review changes", keywords: "suggestions comments track changes accept reject panel", global: true, checked: () => app.get().review, run: toggleReview, enabled: hasDoc },
  { id: "review.next", label: "Next change or comment", keywords: "review", global: true, run: () => step(1), enabled: hasEditor },
  { id: "review.prev", label: "Previous change or comment", keywords: "review", global: true, run: () => step(-1), enabled: hasEditor },
  { id: "review.acceptAll", label: "Accept all changes", keywords: "review suggestions", global: true, run: () => decideAll("accept"), enabled: canDecide },
  { id: "review.rejectAll", label: "Reject all changes", keywords: "review suggestions", global: true, run: () => decideAll("reject"), enabled: canDecide },

  // Help
  { id: "help.shortcuts", label: "Keyboard shortcuts", keys: ["Ctrl+/"], global: true, run: () => openDialog({ kind: "shortcuts" }) },
  { id: "help.about", label: "About P-Doc", global: true, run: () => openDialog({ kind: "about" }) },
  { id: "help.logs", label: "Open logs folder", global: true, run: () => void window.pdoc.app.openLogs() },
];

function clip(action: "cut" | "copy" | "paste" | "pasteAndMatchStyle"): void {
  ed()?.commands.focus();
  window.pdoc.app.edit(action);
}

function openFind(mode: "find" | "replace"): void {
  app.set({ find: mode, focus: false });
  requestAnimationFrame(() => {
    const f = document.querySelector<HTMLInputElement>("#find-query");
    f?.focus();
    f?.select();
  });
}

export const COMMANDS = new Map(commands.map((c) => [c.id, c]));

/** Labels that depend on the document (Move to Public / Private, Update Heading 1 to match). */
export function labelOf(c: Command): string {
  if (c.id === "file.move") return app.get().current?.space === "public" ? "Move to Private" : "Move to Public";
  if (c.id === "style.update") {
    const e = ed();
    const k = e ? styleKeyAt(e) : null;
    return k ? `Update ${STYLE_LABELS[k]} to match` : c.label;
  }
  if (c.id === "spacing.before") {
    const e = ed();
    return e && spaceAt(e, "spaceBefore") > 0 ? "Remove space before paragraph" : "Add space before paragraph";
  }
  if (c.id === "spacing.after") {
    const e = ed();
    return e && spaceAt(e, "spaceAfter") > 0 ? "Remove space after paragraph" : "Add space after paragraph";
  }
  return c.label;
}

export const MENUS: Menu[] = [
  {
    id: "file",
    label: "File",
    key: "F",
    items: [
      "file.new",
      "file.library",
      "file.openFile",
      "-",
      "file.copy",
      "file.rename",
      "file.move",
      "file.delete",
      "-",
      { label: "Version history", items: ["file.history", "file.nameVersion"] },
      "file.sync",
      "-",
      { label: "Download", items: ["file.docx", "file.pdf", "file.md", "file.html", "file.txt"] },
      "file.pageSetup",
      "file.print",
      "-",
      "file.settings",
    ],
  },
  { id: "edit", label: "Edit", key: "E", items: ["edit.undo", "edit.redo", "-", "edit.cut", "edit.copy", "edit.paste", "edit.pasteText", "-", "edit.selectAll", "-", "edit.find", "edit.replace"] },
  {
    id: "view",
    label: "View",
    key: "V",
    items: [
      "view.outline",
      "view.library",
      "view.history",
      { label: "Mode", items: ["mode.editing", "mode.suggesting", "mode.viewing"] },
      { label: "Markup", items: ["view.markup.simple", "view.markup.all", "view.markup.none", "view.markup.original"] },
      "-",
      "view.pages",
      "view.pageless",
      { label: "Text width", items: ["view.width.narrow", "view.width.medium", "view.width.wide", "view.width.full"] },
      "-",
      { label: "Zoom", items: ["view.zoomIn", "view.zoomOut", "view.zoomReset"] },
      "view.focus",
      "view.compact",
      "view.fullScreen",
      "-",
      { label: "Appearance", items: ["view.theme.light", "view.theme.dark", "view.theme.system"] },
    ],
  },
  {
    id: "insert",
    label: "Insert",
    key: "I",
    items: ["insert.image", { label: "Table", items: ["insert.table2", "insert.table3", "insert.table4", "insert.table5"] }, "insert.link", "insert.hr", "insert.pageBreak", "insert.toc", "insert.headerFooter", "insert.special", "-", "insert.comment"],
  },
  {
    id: "format",
    label: "Format",
    key: "O",
    items: [
      { label: "Text", items: ["format.bold", "format.italic", "format.underline", "format.strike", "format.sup", "format.sub", "-", "format.sizeUp", "format.sizeDown"] },
      { label: "Paragraph styles", items: [...STYLE_KEYS_MENU.map((k) => `style.${k}`), "-", "style.update", "style.reset"] },
      { label: "Align", items: ["align.left", "align.center", "align.right", "align.justify"] },
      { label: "Indent", items: ["indent.more", "indent.less"] },
      { label: "Line spacing", items: [...LINE_SPACINGS.map(([, v]) => `spacing.${v}`), "-", "spacing.before", "spacing.after"] },
      { label: "Lists", items: ["list.bullets", "list.numbers", "list.checklist"] },
      { label: "Table", items: ["table.rowAbove", "table.rowBelow", "table.colLeft", "table.colRight", "-", "table.deleteRow", "table.deleteCol", "table.delete"] },
      "-",
      "format.clear",
    ],
  },
  {
    id: "tools",
    label: "Tools",
    key: "T",
    items: ["tools.wordCount", "tools.spelling", "-", "tools.review", { label: "Changes", items: ["review.next", "review.prev", "-", "review.acceptAll", "review.rejectAll"] }, "-", "tools.search"],
  },
  { id: "help", label: "Help", key: "H", items: ["help.shortcuts", "help.about", "help.logs"] },
];

/** Where each command sits in the menus ("Format › Text"), for command search and the shortcuts list. */
export const MENU_PATH = new Map<string, string>();
for (const m of MENUS) {
  const walk = (entries: MenuEntry[], path: string) => {
    for (const e of entries) {
      if (typeof e === "string") {
        if (e !== "-" && !MENU_PATH.has(e)) MENU_PATH.set(e, path);
      } else walk(e.items, `${path} › ${e.label}`);
    }
  };
  walk(m.items, m.label);
}

const BY_CHORD = new Map<string, Command>();
for (const c of commands) for (const k of c.keys ?? []) BY_CHORD.set(k, c);

export const commandForChord = (chord: string) => BY_CHORD.get(chord);

export function runCommand(id: string): void {
  const c = COMMANDS.get(id);
  syncSelection();
  if (!c || (c.enabled && !c.enabled())) return;
  c.run();
}

export const shownChord = (c: Command) => c.keys?.[0] ?? c.hint;
