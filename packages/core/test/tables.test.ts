import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { createDocument, fromHTML, toHTML } from "../src/index.ts";
import { toDocx } from "../src/docx.ts";

const unzip = async (bytes: Uint8Array, name: string) => {
  const JSZip = (await import("jszip")).default;
  return (await JSZip.loadAsync(bytes)).file(name)!.async("string");
};

const cell = (text: string, attrs: Record<string, unknown> = {}, type = "tableCell"): JSONContent => ({ type, attrs, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
/** A 2×3 table: a shaded header row, a merged cell, widths dragged to 120, 200 and 80 px, a cell in the middle. */
const table: JSONContent = {
  type: "table",
  content: [
    {
      type: "tableRow",
      content: [
        cell("Name", { colwidth: [120], background: "#cfe2f3" }, "tableHeader"),
        cell("Notes", { colwidth: [200], background: "#cfe2f3" }, "tableHeader"),
        cell("Qty", { colwidth: [80], background: "#cfe2f3" }, "tableHeader"),
      ],
    },
    { type: "tableRow", content: [cell("Ada", { colwidth: [120], valign: "middle", borderWidth: 1.5, borderColor: "#1a73e8", padding: 6 }), cell("Merged across two", { colspan: 2, colwidth: [200, 80], valign: "bottom", borderWidth: 0 })] },
  ],
};
const doc = () => {
  const d = createDocument({ title: "Tables" });
  d.content = { type: "doc", content: [table] };
  return d;
};

describe("tables (U60)", () => {
  it("keeps widths, shading and vertical alignment in HTML, and reads them back", () => {
    const html = toHTML(doc());
    expect(html).toContain('<col style="width: 120px;">');
    expect(html).toContain('<th style="background-color: #cfe2f3;" colwidth="120">');
    expect(html).toMatch(/<td style="[^"]*vertical-align: bottom[^"]*"[^>]*colspan="2"[^>]*colwidth="200,80"/);
    const back = fromHTML(html).content![0]!;
    const [head, row] = back.content!;
    expect(head!.content![0]!.attrs).toMatchObject({ colwidth: [120], background: "#cfe2f3" });
    expect(row!.content![0]!.attrs).toMatchObject({ valign: "middle", borderWidth: 1.5, borderColor: "#1a73e8", padding: 6 });
    expect(html).toContain("border: 1.5pt solid #1a73e8");
    expect(html).toContain("padding: 6pt");
    expect(html).toContain("border: none");
    expect(row!.content![1]!.attrs).toMatchObject({ colspan: 2, colwidth: [200, 80], valign: "bottom" });
  });

  it("reads shading from pasted HTML as a browser reports it", () => {
    const back = fromHTML('<table><tr><td style="background-color: rgb(244, 204, 204); vertical-align: middle">x</td><td style="background:#FC0">y</td></tr></table>').content![0]!;
    const [a, b] = back.content![0]!.content!;
    expect(a!.attrs).toMatchObject({ background: "#f4cccc", valign: "middle" });
    expect(b!.attrs?.background).toBe("#ffcc00");
  });

  it("writes Word's grid, cell widths, shading, merges, vertical alignment and the repeated header", async () => {
    const xml = await unzip(await toDocx(doc()), "word/document.xml");
    expect(xml).toContain('<w:gridCol w:w="1800"/><w:gridCol w:w="3000"/><w:gridCol w:w="1200"/>');
    expect(xml).toContain('<w:tblW w:type="dxa" w:w="6000"/>');
    expect(xml).toContain('<w:tcW w:type="dxa" w:w="4200"/>');
    expect(xml).toContain('<w:gridSpan w:val="2"/>');
    expect(xml.match(/<w:shd w:fill="CFE2F3"/g)?.length).toBe(3);
    expect(xml).toContain('<w:vAlign w:val="center"/>');
    expect(xml).toContain('<w:vAlign w:val="bottom"/>');
    expect(xml).toContain("<w:tblHeader/>");
    expect(xml).toMatch(/<w:tcBorders><w:top w:val="single" w:color="1A73E8" w:sz="12"\/>/);
    expect(xml).toMatch(/<w:tcBorders><w:top w:val="none"/);
    expect(xml).toContain('<w:tcMar><w:top w:type="dxa" w:w="120"/>');
  });

  it("fills the line in Word when no width was set", async () => {
    const d = doc();
    const strip = (n: JSONContent): JSONContent => ({ ...n, attrs: n.attrs ? { ...n.attrs, colwidth: null } : n.attrs, content: n.content?.map(strip) });
    d.content = { type: "doc", content: [strip(table)] };
    const xml = await unzip(await toDocx(d), "word/document.xml");
    expect(xml).toContain('<w:tblW w:type="pct" w:w="5000"/>');
  });
});
