/** Conversions between P-Doc documents and HTML, Markdown and plain text (U17, U18). */
import type { JSONContent } from "@tiptap/core";
import { generateHTML, generateJSON } from "@tiptap/html";
import { Marked, type TokenizerAndRendererExtension } from "marked";
import { createDocument, headerFooterText, pageInches, type PDocFile } from "./format.ts";
import { extensions } from "./schema.ts";
import { styleCss } from "./styles.ts";
import { acceptAll } from "./suggestions.ts";
import { nodeText } from "./outline.ts";
import { noteLabelsOf, notesListOf, withNoteLabels } from "./notes.ts";
import { equationsToMathml } from "./equations.ts";

type Mark = NonNullable<JSONContent["marks"]>[number];

const contentOf = (doc: PDocFile | JSONContent): JSONContent => ((doc as PDocFile).format === "p-doc" ? (doc as PDocFile).content : (doc as JSONContent));

/** Content as it reads with every suggestion accepted and comment anchors dropped: what exports carry. */
export function finalContent(content: JSONContent): JSONContent {
  return dropComments(acceptAll(content));
}

function dropComments(node: JSONContent): JSONContent {
  const out: JSONContent = { ...node };
  if (node.marks) {
    const marks = node.marks.filter((m) => m.type !== "comment");
    if (marks.length) out.marks = marks;
    else delete out.marks;
  }
  if (node.content) out.content = node.content.map(dropComments);
  return out;
}

// ------------------------------------------------------------------------------ HTML

export function contentToHTML(content: JSONContent): string {
  return withNoteLabels(noteLabelsOf(content), () => generateHTML(content, extensions()));
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A standalone web page for a document. */
export function toHTML(doc: PDocFile, o: { final?: boolean } = { final: true }): string {
  const content = o.final === false ? doc.content : finalContent(doc.content);
  const body = equationsToMathml(contentToHTML(content));
  const { width } = pageInches(doc.page);
  const textWidth = width - doc.page.margins.left - doc.page.margins.right;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="generator" content="P-Doc">
<title>${escapeHtml(doc.title)}</title>
<style>
body { margin: 2rem auto; max-width: ${textWidth}in; padding: 0 1rem; color: #000; background: ${doc.page.color}; }
${styleCss(doc.styles, "body")}
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }
img { max-width: 100%; }
.pd-page-break { break-after: page; }
.pd-toc ul { list-style: none; padding-left: 0; }
.pd-toc .pd-toc-l2 { padding-left: 1.5em; } .pd-toc .pd-toc-l3 { padding-left: 3em; } .pd-toc .pd-toc-l4 { padding-left: 4.5em; } .pd-toc .pd-toc-l5 { padding-left: 6em; } .pd-toc .pd-toc-l6 { padding-left: 7.5em; }
ul[data-type="taskList"] { list-style: none; padding-left: 0.5em; }
ul[data-type="taskList"] li { display: flex; gap: 0.5em; }
.pd-note-ref a { text-decoration: none; }
.pd-notes { margin-top: 2em; border-top: 1px solid #999; padding-top: 0.5em; }
.pd-note > p:first-child::before { content: var(--pd-n) " "; vertical-align: super; font-size: 0.7em; }
.pd-note > p { margin: 0 0 0.25em; }
.pd-math-block { text-align: center; margin: 0.5em 0; }
</style>
</head>
<body>
${doc.page.header ? `<header>${escapeHtml(headerFooterText(doc.page, "header", 1, 1))}</header>\n` : ""}${body}
</body>
</html>
`;
}

/** Content from HTML (only what the schema knows survives; scripts and unknown elements are dropped). */
export function fromHTML(html: string): JSONContent {
  const json = generateJSON(html, extensions()) as JSONContent;
  if (!json.content?.length) json.content = [{ type: "paragraph" }];
  return json;
}

// ------------------------------------------------------------------------------ Markdown

const mdEscape = (s: string) => s.replace(/([\\`*_[\]<>$])/g, "\\$1").replace(/^(\s*)([#>+-]|\d+\.)(\s)/, "$1\\$2$3");

/** Markdown footnote names of the notes being written ([^1]); endnotes whose label a footnote has get an "e". */
let mdNotes: Map<string, string> | null = null;

function inlineMd(nodes: JSONContent[] | undefined): string {
  let out = "";
  for (const n of nodes ?? []) {
    if (n.type === "noteRef") {
      const name = mdNotes?.get(String(n.attrs?.id ?? ""));
      if (name) out += `[^${name}]`;
      continue;
    }
    if (n.type === "mathInline") {
      out += `$${String(n.attrs?.latex ?? "")}$`;
      continue;
    }
    if (n.type === "hardBreak") {
      out += "  \n";
      continue;
    }
    if (n.type === "tab") {
      out += "\t";
      continue;
    }
    if (n.type === "image") {
      out += `![${mdEscape(String(n.attrs?.alt ?? ""))}](${String(n.attrs?.src ?? "")})`;
      continue;
    }
    if (n.type !== "text") continue;
    const marks = (n.marks ?? []) as Mark[];
    const has = (t: string) => marks.some((m) => m.type === t);
    const raw = n.text ?? "";
    let t = has("code") ? `\`${raw.replace(/`/g, "\\`")}\`` : mdEscape(raw);
    const lead = /^\s*/.exec(t)![0];
    const trail = /\s*$/.exec(t)![0];
    let core = t.slice(lead.length, t.length - trail.length || undefined);
    if (core) {
      if (has("bold")) core = `**${core}**`;
      if (has("italic")) core = `*${core}*`;
      if (has("strike")) core = `~~${core}~~`;
      if (has("underline")) core = `<u>${core}</u>`;
      if (has("superscript")) core = `<sup>${core}</sup>`;
      if (has("subscript")) core = `<sub>${core}</sub>`;
      const link = marks.find((m) => m.type === "link");
      if (link) core = `[${core}](${String(link.attrs?.href ?? "")})`;
      t = lead + core + trail;
    }
    out += t;
  }
  return out;
}

function blockMd(n: JSONContent, indent = ""): string[] {
  switch (n.type) {
    case "heading":
      return [`${"#".repeat(Number(n.attrs?.level ?? 1))} ${inlineMd(n.content)}`];
    case "paragraph": {
      const t = inlineMd(n.content);
      if (n.attrs?.textStyle === "title") return [`# ${t}`];
      if (n.attrs?.textStyle === "subtitle") return [t ? `*${t}*` : ""];
      return [t];
    }
    case "blockquote":
      return [(n.content ?? []).flatMap((c) => blockMd(c)).join("\n\n").split("\n").map((l) => `> ${l}`.trimEnd()).join("\n")];
    case "codeBlock":
      return [`\`\`\`${String(n.attrs?.language ?? "")}\n${nodeText(n)}\n\`\`\``];
    case "horizontalRule":
      return ["---"];
    case "pageBreak":
      return ['<div style="page-break-after: always"></div>'];
    case "sectionBreak":
      // Markdown has no sections: one that starts a page is a page break.
      return n.attrs?.kind === "continuous" ? [] : ['<div style="page-break-after: always"></div>'];
    case "columnBreak":
      return [];
    case "mathBlock":
      return [`$$\n${String(n.attrs?.latex ?? "")}\n$$`];
    case "image":
      return [inlineMd([n])];
    case "tableOfContents":
      return [((n.attrs?.entries ?? []) as { level: number; text: string; id: string }[]).map((e) => `${"  ".repeat(e.level - 1)}- [${mdEscape(e.text)}](#${e.id})`).join("\n")];
    case "bulletList":
    case "orderedList":
    case "taskList":
      return [listMd(n, indent)];
    case "table":
      return [tableMd(n)];
    default:
      return n.content ? n.content.flatMap((c) => blockMd(c, indent)) : [];
  }
}

function listMd(list: JSONContent, indent: string): string {
  const lines: string[] = [];
  let k = Number(list.attrs?.start ?? 1);
  for (const item of list.content ?? []) {
    const marker = list.type === "orderedList" ? `${k++}.` : list.type === "taskList" ? `- [${item.attrs?.checked ? "x" : " "}]` : "-";
    const pad = `${indent}${" ".repeat(marker.length + 1)}`;
    let first = true;
    for (const child of item.content ?? []) {
      if (child.type === "bulletList" || child.type === "orderedList" || child.type === "taskList") lines.push(listMd(child, pad));
      else {
        const text = blockMd(child, pad).join("\n");
        lines.push(first ? `${indent}${marker} ${text}` : `${pad}${text}`);
        first = false;
      }
    }
    if (first) lines.push(`${indent}${marker}`);
  }
  return lines.join("\n");
}

function tableMd(table: JSONContent): string {
  const rows = (table.content ?? []).map((r) => (r.content ?? []).map((c) => (c.content ?? []).map((p) => inlineMd(p.content)).join(" ").replace(/\|/g, "\\|").replace(/\n/g, " ")));
  if (!rows.length) return "";
  const cols = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(cols - r.length).fill("")];
  const line = (r: string[]) => `| ${pad(r).join(" | ")} |`;
  return [line(rows[0]!), `|${" --- |".repeat(cols)}`, ...rows.slice(1).map(line)].join("\n");
}

/** Each note's label, made unique across footnotes and endnotes (both may count 1, 2, 3). */
function uniqueLabels(content: JSONContent): Map<string, string> {
  const labels = noteLabelsOf(content);
  const kinds = new Map(notesListOf(content).map((n) => [n.id, n.kind]));
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const [id, label] of labels) {
    let name = label;
    if (kinds.get(id) === "endnote" && used.has(name)) name = `e${label}`;
    while (used.has(name)) name += "'";
    used.add(name);
    out.set(id, name);
  }
  return out;
}

export function toMarkdown(doc: PDocFile | JSONContent): string {
  const content = finalContent(contentOf(doc));
  mdNotes = uniqueLabels(content);
  try {
    const blocks = (content.content ?? []).filter((b) => b.type !== "notes").flatMap((b) => blockMd(b));
    // Notes as Markdown footnotes, in number order (footnotes, then endnotes).
    for (const n of notesListOf(content)) {
      const name = mdNotes.get(n.id);
      if (!name) continue;
      const body = n.content.flatMap((c) => blockMd(c)).join("\n\n").replace(/\n/g, "\n    ");
      blocks.push(`[^${name}]: ${body}`);
    }
    return `${blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
  } finally {
    mdNotes = null;
  }
}

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** `$…$` and `$$…$$` as equations (U62); a `$` before a digit or after a space is a dollar sign. */
const mathMd: TokenizerAndRendererExtension[] = [
  {
    name: "mathBlock",
    level: "block",
    start: (src) => src.match(/^\$\$/m)?.index,
    tokenizer(src) {
      const m = /^\$\$\s*\n?([\s\S]+?)\n?\s*\$\$[ \t]*(?:\n|$)/.exec(src);
      return m ? { type: "mathBlock", raw: m[0], text: m[1]!.trim() } : undefined;
    },
    renderer: (t) => `<div data-type="math-block" data-latex="${attr(String(t.text))}"></div>`,
  },
  {
    name: "mathInline",
    level: "inline",
    start: (src) => src.indexOf("$") < 0 ? undefined : src.indexOf("$"),
    tokenizer(src) {
      const m = /^\$(?![\s$])((?:\\.|[^$\\\n])+?)(?<!\s)\$(?!\d)/.exec(src);
      return m ? { type: "mathInline", raw: m[0], text: m[1]! } : undefined;
    },
    renderer: (t) => `<span data-type="math-inline" data-latex="${attr(String(t.text))}"></span>`,
  },
];
const marked = new Marked({ gfm: true, extensions: mathMd });

export function fromMarkdown(md: string): JSONContent {
  const html = marked.parse(md, { async: false }) as string;
  // GFM task items to the schema's task list.
  const tasks = html.replace(/<ul>\s*((?:<li><input[^>]*type="checkbox"[^>]*>[\s\S]*?<\/li>\s*)+)<\/ul>/g, (_m, items: string) =>
    `<ul data-type="taskList">${items.replace(/<li><input([^>]*)>\s*([\s\S]*?)<\/li>/g, (_x, attrs: string, body: string) => `<li data-type="taskItem" data-checked="${/checked/.test(attrs)}"><p>${body.trim()}</p></li>`)}</ul>`,
  );
  // marked ends a code block with a newline the fence doesn't hold.
  return fromHTML(tasks.replace(/\n<\/code><\/pre>/g, "</code></pre>"));
}

// ------------------------------------------------------------------------------ Text

function blockText(n: JSONContent, indent = ""): string[] {
  switch (n.type) {
    case "bulletList":
    case "orderedList":
    case "taskList": {
      let k = Number(n.attrs?.start ?? 1);
      return (n.content ?? []).flatMap((item) => {
        const marker = n.type === "orderedList" ? `${k++}.` : n.type === "taskList" ? (item.attrs?.checked ? "[x]" : "[ ]") : "•";
        const [first, ...rest] = item.content ?? [];
        return [`${indent}${marker} ${nodeText(first)}`, ...rest.flatMap((c) => blockText(c, `${indent}   `))];
      });
    }
    case "table":
      return (n.content ?? []).map((r) => (r.content ?? []).map((c) => nodeText(c).replace(/\s+/g, " ")).join("\t"));
    case "tableOfContents":
      return ((n.attrs?.entries ?? []) as { level: number; text: string }[]).map((e) => `${"  ".repeat(e.level - 1)}${e.text}`);
    case "horizontalRule":
      return ["――――――――――"];
    case "pageBreak":
      return ["\f"];
    case "sectionBreak":
      return n.attrs?.kind === "continuous" ? [] : ["\f"];
    case "columnBreak":
      return [];
    case "mathBlock":
      return [`${indent}${String(n.attrs?.latex ?? "")}`];
    case "blockquote":
      return (n.content ?? []).flatMap((c) => blockText(c, indent));
    default:
      return [`${indent}${nodeText(n)}`];
  }
}

/** Note references as "[1]", the way plain text shows them. */
function refsAsText(n: JSONContent, labels: Map<string, string>): JSONContent {
  if (n.type === "noteRef") return { type: "text", text: `[${labels.get(String(n.attrs?.id ?? "")) ?? ""}]` };
  return n.content ? { ...n, content: n.content.map((c) => refsAsText(c, labels)) } : n;
}

export function toText(doc: PDocFile | JSONContent): string {
  const content = finalContent(contentOf(doc));
  const labels = uniqueLabels(content);
  const lines = (content.content ?? []).filter((b) => b.type !== "notes").flatMap((b) => blockText(refsAsText(b, labels)));
  const notes = notesListOf(content).filter((n) => labels.has(n.id));
  if (notes.length) lines.push("", "――――――――――", ...notes.map((n) => `[${labels.get(n.id)}] ${n.content.map((c) => nodeText(refsAsText(c, labels))).join("\n")}`));
  return `${lines.join("\n").trimEnd()}\n`;
}

export function fromText(text: string): JSONContent {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return { type: "doc", content: lines.map((l) => (l ? { type: "paragraph", content: [{ type: "text", text: l }] } : { type: "paragraph" })) };
}

// ------------------------------------------------------------------------------ Import by file name

export type ImportKind = "docx" | "md" | "html" | "txt" | "pdoc";

export function importKind(fileName: string): ImportKind | null {
  const f = fileName.toLowerCase();
  if (f.endsWith(".pdoc.json")) return "pdoc";
  if (f.endsWith(".docx")) return "docx";
  if (f.endsWith(".md") || f.endsWith(".markdown")) return "md";
  if (f.endsWith(".html") || f.endsWith(".htm")) return "html";
  if (f.endsWith(".txt")) return "txt";
  return null;
}

/** A document's title from a file name. */
export function titleFromFile(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.(pdoc\.json|docx|md|markdown|html?|txt)$/i, "");
  return base.replace(/[_]+/g, " ").trim() || "Untitled document";
}

export function documentFrom(content: JSONContent, title: string): PDocFile {
  return createDocument({ title, content });
}
