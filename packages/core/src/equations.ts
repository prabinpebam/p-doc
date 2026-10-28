import { mergeAttributes, Node } from "@tiptap/core";
import katex from "katex";

/**
 * Equations (U62): LaTeX is what the file keeps; KaTeX (O13) draws it as MathML, which the window, the PDF
 * and a web page all show natively, and docx's `latexToMath` writes it as Word's own equations (A17).
 */

/** MathML for `latex`, or null with the reason it can't be read. */
export function mathml(latex: string, display = false): { html: string; error: null } | { html: null; error: string } {
  try {
    return { html: katex.renderToString(latex, { output: "mathml", displayMode: display, throwOnError: true, strict: "ignore" }), error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message.replace(/^KaTeX parse error:\s*/, "") : String(e);
    return { html: null, error: msg };
  }
}

/** MathML that shows the source in place of what can't be read (a file edited by hand, say). */
export function mathmlOrSource(latex: string, display = false): string {
  const m = mathml(latex, display);
  if (m.html) return m.html;
  const esc = latex.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<span class="pd-math-error">${esc}</span>`;
}

/** The LaTeX a MathML element was made from, when it says (KaTeX's and P-Doc's web pages do). */
const texOf = (el: HTMLElement): string | null => el.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() ?? null;
const latexOf = (el: HTMLElement): string => el.getAttribute("data-latex") ?? texOf(el) ?? "";

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { latex: { default: "", parseHTML: latexOf, renderHTML: (a) => ({ "data-latex": a.latex }) } };
  },
  parseHTML() {
    return [
      { tag: 'span[data-type="math-inline"]' },
      { tag: "math", getAttrs: (el) => (el.getAttribute("display") !== "block" && texOf(el) != null ? null : false) },
    ];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "math-inline", class: "pd-math" }), String(node.attrs.latex)];
  },
  renderText: ({ node }) => String(node.attrs.latex),
});

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { latex: { default: "", parseHTML: latexOf, renderHTML: (a) => ({ "data-latex": a.latex }) } };
  },
  parseHTML() {
    return [
      { tag: 'div[data-type="math-block"]' },
      { tag: "math", priority: 60, getAttrs: (el) => (el.getAttribute("display") === "block" && texOf(el) != null ? null : false) },
    ];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "math-block", class: "pd-math-block" }), String(node.attrs.latex)];
  },
  renderText: ({ node }) => String(node.attrs.latex),
});

const unescapeAttr = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** A web page's equations as MathML in place of the LaTeX the schema writes. */
export function equationsToMathml(html: string): string {
  return html
    .replace(/<span([^>]*)data-type="math-inline"([^>]*)>[\s\S]*?<\/span>/g, (_m, a: string, b: string) => mathmlOrSource(unescapeAttr(/data-latex="([^"]*)"/.exec(a + b)?.[1] ?? ""), false))
    .replace(/<div([^>]*)data-type="math-block"([^>]*)>[\s\S]*?<\/div>/g, (_m, a: string, b: string) => `<div class="pd-math-block">${mathmlOrSource(unescapeAttr(/data-latex="([^"]*)"/.exec(a + b)?.[1] ?? ""), true)}</div>`);
}
