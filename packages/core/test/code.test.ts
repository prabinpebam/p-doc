import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { createDocument, fromHTML, fromMarkdown, toHTML, toMarkdown, toText } from "../src/index.ts";

const doc = (content: JSONContent[]) => {
  const d = createDocument({ title: "Code" });
  d.content = { type: "doc", content };
  return d;
};
const block = (language: string | null, text: string): JSONContent => ({ type: "codeBlock", attrs: { language }, content: [{ type: "text", text }] });

describe("code blocks (U61)", () => {
  const js = 'const total = items.reduce((a, b) => a + b, 0);\n// done\nconsole.log("total", total);';

  it("keeps the language in Markdown, both ways", () => {
    const md = toMarkdown(doc([block("javascript", js), block(null, "plain text\n  indented")]));
    expect(md).toContain("```javascript\nconst total");
    expect(md).toContain("```\nplain text\n  indented\n```");
    const back = fromMarkdown(md).content!;
    const blocks = back.filter((n) => n.type === "codeBlock");
    expect(blocks.map((b) => b.attrs?.language ?? null)).toEqual(["javascript", null]);
    expect(blocks[0]!.content![0]!.text).toBe(js);
    // A short name stays as written.
    expect(fromMarkdown("```ts\nlet x: number = 1;\n```").content![0]!.attrs?.language).toBe("ts");
  });

  it("keeps the language in a web page and reads it back", () => {
    const html = toHTML(doc([block("python", "def f(x):\n    return x * 2")]));
    expect(html).toContain('class="language-python"');
    expect(html).toContain("    return x * 2");
    const back = fromHTML(html.replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, ""));
    const b = back.content!.find((n) => n.type === "codeBlock")!;
    expect(b.attrs?.language).toBe("python");
  });

  it("is plain text in a text export", () => {
    expect(toText(doc([block("javascript", js)]))).toContain('console.log("total", total);');
  });
});
