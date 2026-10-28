/**
 * Code blocks that highlight by language (U61): lowlight (highlight.js grammars, BSD-3) colours the code as
 * decorations, so the stored document keeps only the text and its language. A picker at the top right of
 * each block sets the language: "Automatic" (none stored) lets highlight.js guess, "Plain text" never colours.
 * Typing ```js and a space starts a JavaScript block.
 */
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as PMNode } from "@tiptap/pm/model";

export const lowlight = createLowlight(common);

/** The languages offered, by highlight.js name; the stored language is the name. */
export const LANGUAGES: [string, string][] = [
  ["", "Automatic"],
  ["plaintext", "Plain text"],
  ["bash", "Bash"],
  ["c", "C"],
  ["cpp", "C++"],
  ["csharp", "C#"],
  ["css", "CSS"],
  ["diff", "Diff"],
  ["go", "Go"],
  ["xml", "HTML and XML"],
  ["java", "Java"],
  ["javascript", "JavaScript"],
  ["json", "JSON"],
  ["kotlin", "Kotlin"],
  ["markdown", "Markdown"],
  ["php", "PHP"],
  ["powershell", "PowerShell"],
  ["python", "Python"],
  ["ruby", "Ruby"],
  ["rust", "Rust"],
  ["sql", "SQL"],
  ["swift", "Swift"],
  ["typescript", "TypeScript"],
  ["yaml", "YAML"],
];

const ALIASES: Record<string, string> = { js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", py: "python", html: "xml", sh: "bash", shell: "bash", yml: "yaml", cs: "csharp", "c#": "csharp", "c++": "cpp", md: "markdown", ps1: "powershell", rs: "rust", rb: "ruby", text: "plaintext", txt: "plaintext", plain: "plaintext" };

/** The picker's entry for a stored language: a short name (js, py, html) shows as its language. */
export function languageName(language: string | null | undefined): string {
  const l = (language ?? "").trim().toLowerCase();
  return ALIASES[l] ?? l;
}

export const LiveCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current: PMNode = node;
      const dom = document.createElement("pre");
      const code = document.createElement("code");
      const bar = document.createElement("span");
      bar.className = "pd-code-lang";
      bar.contentEditable = "false";
      const pick = document.createElement("select");
      pick.setAttribute("aria-label", "Code language");
      bar.append(pick);
      dom.append(bar, code);
      const show = (n: PMNode) => {
        const lang = languageName(n.attrs.language as string | null);
        const options = LANGUAGES.some(([id]) => id === lang) ? LANGUAGES : [...LANGUAGES, [lang, lang] as [string, string]];
        if (pick.options.length !== options.length) pick.replaceChildren(...options.map(([id, label]) => new Option(label, id)));
        pick.value = lang;
        code.className = lang ? `language-${lang}` : "";
        pick.disabled = !editor.isEditable;
      };
      show(node);
      // Viewing (and a version on show) can't change the language; setEditable sets the root's contenteditable.
      const watch = new MutationObserver(() => void (pick.disabled = !editor.isEditable));
      watch.observe(editor.view.dom, { attributes: true, attributeFilter: ["contenteditable"] });
      pick.addEventListener("change", () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (pos == null || !editor.isEditable) return show(current);
        // Its own Undo step, never merged with the typing before it.
        editor.view.dispatch(closeHistory(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, language: pick.value || null })));
        editor.view.focus();
      });
      return {
        dom,
        contentDOM: code,
        update: (n: PMNode) => {
          if (n.type !== current.type) return false;
          current = n;
          show(n);
          return true;
        },
        stopEvent: (e: Event) => bar.contains(e.target as Node),
        destroy: () => watch.disconnect(),
        ignoreMutation: (m) => bar.contains(m.target as Node) || (m.type === "attributes" && m.target === code),
      };
    };
  },
}).configure({ lowlight, defaultLanguage: null });