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
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Select } from "../ui/primitives/Select.tsx";

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
      dom.append(bar, code);
      // The app's own Select, in its own React root inside the block.
      const root = createRoot(bar);
      const change = (value: string) => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (pos == null || !editor.isEditable) return;
        // Its own Undo step, never merged with the typing before it.
        editor.view.dispatch(closeHistory(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, language: value || null })));
        editor.view.focus();
      };
      const show = (n: PMNode) => {
        const lang = languageName(n.attrs.language as string | null);
        const options = LANGUAGES.some(([id]) => id === lang) ? LANGUAGES : [...LANGUAGES, [lang, lang] as [string, string]];
        code.className = lang ? `language-${lang}` : "";
        const items = options.map(([id, label]) => createElement("option", { key: id, value: id }, label));
        root.render(createElement(Select, { "aria-label": "Code language", variant: "toolbar", value: lang, disabled: !editor.isEditable, onValueChange: change, children: items }));
      };
      show(node);
      // Viewing (and a version on show) can't change the language; setEditable sets the root's contenteditable.
      const watch = new MutationObserver(() => show(current));
      watch.observe(editor.view.dom, { attributes: true, attributeFilter: ["contenteditable"] });
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
        destroy: () => {
          watch.disconnect();
          // Unmounting while ProseMirror updates the view would warn; the next tick is safe.
          queueMicrotask(() => root.unmount());
        },
        ignoreMutation: (m) => bar.contains(m.target as Node) || (m.type === "attributes" && m.target === code),
      };
    };
  },
}).configure({ lowlight, defaultLanguage: null });