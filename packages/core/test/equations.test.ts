import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { createDocument, fromHTML, fromMarkdown, mathml, toHTML, toMarkdown, toText } from "../src/index.ts";
import { toDocx } from "../src/docx.ts";

/** Ten equations of the kinds a report has: fractions, roots, scripts, sums, integrals, limits, matrices, cases, accents, Greek. */
export const TEN = [
  "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}",
  "e^{i\\pi} + 1 = 0",
  "\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}",
  "\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}",
  "\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1",
  "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
  "f(x) = \\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}",
  "\\sqrt[3]{x_1^2 + x_2^2}",
  "\\hat{\\theta} = \\bar{x} + \\alpha\\beta",
  "\\left( \\frac{a}{b} \\right)^{2}",
];

const unzip = async (bytes: Uint8Array, name: string) => {
  const JSZip = (await import("jszip")).default;
  return (await JSZip.loadAsync(bytes)).file(name)!.async("string");
};

const doc = (content: JSONContent[]) => {
  const d = createDocument({ title: "Equations" });
  d.content = { type: "doc", content };
  return d;
};
const inline = (latex: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text: "So " }, { type: "mathInline", attrs: { latex } }, { type: "text", text: " holds." }] });
const display = (latex: string): JSONContent => ({ type: "mathBlock", attrs: { latex } });

describe("equations", () => {
  it("draws LaTeX as MathML, and says why it can't read a mistake", () => {
    const ok = mathml("\\frac{a}{b}");
    expect(ok.html).toContain("<mfrac>");
    expect(ok.html).toContain('encoding="application/x-tex"');
    expect(mathml("x^2", true).html).toContain('display="block"');
    const bad = mathml("\\frac{a");
    expect(bad.html).toBeNull();
    expect(bad.error).toMatch(/expected '\}'/i);
    expect(mathml("\\nosuchcommand").error).toMatch(/Undefined control sequence/);
  });

  it("writes Word's own equations (OMML) in a .docx, inline and on their own line", async () => {
    const d = doc([inline("x^2"), ...TEN.map(display)]);
    const xml = await unzip(await toDocx(d), "word/document.xml");
    expect(xml.match(/<m:oMath>/g)?.length).toBe(11);
    expect(xml).toContain("<m:f>");
    expect(xml).toContain("<m:rad>");
    expect(xml).toContain("<m:nary>");
    expect(xml).toContain("<m:sSup>");
    expect(xml).toContain("<m:m>");
    // The inline equation sits in its paragraph between the words.
    expect(xml).toMatch(/So <\/w:t>[\s\S]*?<m:oMath>[\s\S]*?<\/m:oMath>[\s\S]*? holds\./);
  });

  it("keeps LaTeX it can't read as text in a .docx, rather than failing the export", async () => {
    const xml = await unzip(await toDocx(doc([display("\\frac{a")])), "word/document.xml");
    expect(xml).not.toContain("<m:oMath>");
    expect(xml).toContain("\\frac{a");
  });

  it("writes MathML in a web page, and reads it back as the same LaTeX", () => {
    const html = toHTML(doc([inline("x^2"), display("\\frac{a}{b}")]));
    expect(html).toContain("<math");
    expect(html).toContain('display="block"');
    expect(html).not.toContain('data-type="math-inline"');
    const back = fromHTML(html.replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, ""));
    const types = JSON.stringify(back);
    expect(types).toContain('"mathInline","attrs":{"latex":"x^2"}');
    expect(types).toContain('"mathBlock","attrs":{"blockChange":null,"latex":"\\\\frac{a}{b}"}');
  });

  it("writes $…$ and $$…$$ in Markdown and reads them back; a dollar sign stays a dollar sign", () => {
    const md = toMarkdown(doc([inline("x^2"), display("\\frac{a}{b}"), { type: "paragraph", content: [{ type: "text", text: "It costs $5 and $6." }] }]));
    expect(md).toContain("So $x^2$ holds.");
    expect(md).toContain("$$\n\\frac{a}{b}\n$$");
    expect(md).toContain("It costs \\$5 and \\$6.");
    const back = JSON.stringify(fromMarkdown(md));
    expect(back).toContain('"mathInline","attrs":{"latex":"x^2"}');
    expect(back).toContain('"mathBlock","attrs":{"blockChange":null,"latex":"\\\\frac{a}{b}"}');
    expect(back).toContain("It costs $5 and $6.");
    expect(JSON.stringify(fromMarkdown("Pay $5 now, $6 later"))).not.toContain("mathInline");
  });

  it("writes the LaTeX in plain text", () => {
    expect(toText(doc([inline("x^2"), display("\\frac{a}{b}")]))).toBe("So x^2 holds.\n\\frac{a}{b}\n");
  });

  // The owner's check of A17 (DoD 12.5): PDOC_TRY_IT=<folder> writes equations.docx there to open in Word.
  it.runIf(!!process.env.PDOC_TRY_IT)("writes the ten-equation .docx for the owner to open in Word", async () => {
    const d = doc([{ type: "paragraph", content: [{ type: "text", text: "Ten equations from P-Doc. Each should be a Word equation you can click into and edit." }] }, inline("a^2 + b^2 = c^2"), ...TEN.map(display)]);
    const dir = process.env.PDOC_TRY_IT!;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "equations.docx"), await toDocx(d));
  });
});
