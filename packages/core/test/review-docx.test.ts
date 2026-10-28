import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import JSZip from "jszip";
import { fromDocx, toDocx } from "../src/docx.ts";
import { createDocument } from "../src/format.ts";
import { nodeText } from "../src/outline.ts";
import { acceptAll, listChanges, rejectAll } from "../src/suggestions.ts";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"';
const D = 'w:date="2026-10-01T09:00:00Z"';
const r = (t: string, rPr = "") => `<w:r>${rPr}<w:t xml:space="preserve">${t}</w:t></w:r>`;

/** Word's own markup for each kind of review change, as Word 365 writes it. */
const BODY = [
  `<w:p>${r("Hello ")}<w:ins w:id="1" w:author="Ana" ${D}>${r("brave ")}</w:ins><w:commentRangeStart w:id="0"/>${r("world")}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r><w:del w:id="2" w:author="Ben" ${D}><w:r><w:delText>old</w:delText></w:r></w:del>${r(".")}</w:p>`,
  `<w:p><w:pPr><w:rPr><w:ins w:id="3" w:author="Ana" ${D}/></w:rPr></w:pPr>${r("First half")}</w:p>`,
  `<w:p>${r("second half")}</w:p>`,
  `<w:p><w:pPr><w:rPr><w:moveFrom w:id="4" w:author="Cy" ${D}/></w:rPr></w:pPr><w:moveFromRangeStart w:id="5" w:author="Cy" ${D} w:name="move1"/><w:moveFrom w:id="6" w:author="Cy" ${D}>${r("Moved text")}</w:moveFrom><w:moveFromRangeEnd w:id="5"/></w:p>`,
  `<w:p>${r("Kept ")}<w:moveToRangeStart w:id="7" w:author="Cy" ${D} w:name="move1"/><w:moveTo w:id="8" w:author="Cy" ${D}>${r("Moved text")}</w:moveTo><w:moveToRangeEnd w:id="7"/></w:p>`,
  `<w:p>${r("Bold now", `<w:rPr><w:b/><w:rPrChange w:id="9" w:author="Dee" ${D}><w:rPr/></w:rPrChange></w:rPr>`)}${r(" plain again", `<w:rPr><w:rPrChange w:id="12" w:author="Dee" ${D}><w:rPr><w:i/></w:rPr></w:rPrChange></w:rPr>`)}</w:p>`,
  `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pPrChange w:id="13" w:author="Eve" ${D}><w:pPr/></w:pPrChange></w:pPr>${r("Now a heading")}</w:p>`,
  `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid>`,
  `<w:tr><w:tc><w:p>${r("Row one")}</w:p></w:tc></w:tr>`,
  `<w:tr><w:trPr><w:ins w:id="10" w:author="Ana" ${D}/></w:trPr><w:tc><w:p><w:ins w:id="11" w:author="Ana" ${D}>${r("Row two")}</w:ins></w:p></w:tc></w:tr></w:tbl>`,
  `<w:p>${r("End")}</w:p>`,
].join("");

const COMMENTS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments ${W}>
<w:comment w:id="0" w:author="Ana" ${D} w:initials="A"><w:p w14:paraId="0A0A0A00"><w:r><w:annotationRef/></w:r>${r("Check this")}</w:p></w:comment>
<w:comment w:id="1" w:author="Ben" w:date="2026-10-02T09:00:00Z" w:initials="B"><w:p w14:paraId="0A0A0A01"><w:r><w:annotationRef/></w:r>${r("Done &amp; dusted")}</w:p></w:comment>
</w:comments>`;
const EXTENDED = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w15:commentsEx ${W}><w15:commentEx w15:paraId="0A0A0A00" w15:done="1"/><w15:commentEx w15:paraId="0A0A0A01" w15:paraIdParent="0A0A0A00" w15:done="0"/></w15:commentsEx>`;

async function wordFile(): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(await toDocx(createDocument({ content: { type: "doc", content: [{ type: "paragraph" }] } })));
  const xml = await zip.file("word/document.xml")!.async("string");
  zip.file("word/document.xml", xml.replace(/<w:body>[\s\S]*?(<w:sectPr)/, `<w:body>${BODY}$1`));
  zip.file("word/comments.xml", COMMENTS);
  zip.file("word/commentsExtended.xml", EXTENDED);
  return new Uint8Array(await zip.generateAsync({ type: "nodebuffer" }));
}

const texts = (c: JSONContent) => (c.content ?? []).map(nodeText);
const allText = (c: JSONContent) => JSON.stringify(c);

describe("import-docx review (13.5)", () => {
  it("brings Word's tracked changes in as suggestions, with their authors and times", async () => {
    const { content } = await fromDocx(await wordFile());
    expect(allText(content)).not.toMatch(/[\uE000-\uE008]/);
    const first = content.content![0]!;
    const marked = (kind: string) => first.content!.filter((n) => n.marks?.some((m) => m.type === kind)).map((n) => [n.text, n.marks!.find((m) => m.type === kind)!.attrs!.author]);
    expect(marked("insertion")).toEqual([["brave ", "Ana"]]);
    expect(marked("deletion")).toEqual([["old", "Ben"]]);
    expect(first.content!.find((n) => n.text === "brave ")!.marks!.find((m) => m.type === "insertion")!.attrs!.time).toBe("2026-10-01T09:00:00Z");
    // The inserted paragraph mark is a new paragraph boundary.
    expect(content.content![2]!.attrs?.split).toMatchObject({ author: "Ana" });
    expect(texts(acceptAll(content)).slice(0, 3)).toEqual(["Hello brave world.", "First half", "second half"]);
    expect(texts(rejectAll(content)).slice(0, 2)).toEqual(["Hello worldold.", "First halfsecond half"]);
  });

  it("brings comments in with replies and resolved state, on the text they were on", async () => {
    const { content, comments } = await fromDocx(await wordFile());
    const thread = comments.find((c) => c.id === "c-w0")!;
    expect(thread).toMatchObject({ author: "Ana", body: "Check this", resolved: true, quote: "world", created: "2026-10-01T09:00:00Z" });
    expect(thread.replies).toEqual([{ id: "c-w1", author: "Ben", created: "2026-10-02T09:00:00Z", body: "Done & dusted" }]);
    const world = content.content![0]!.content!.find((n) => n.text === "world")!;
    expect(world.marks).toEqual([{ type: "comment", attrs: { id: "c-w0" } }]);
  });

  it("keeps moves and table changes as comments, applied as Word shows them", async () => {
    const { content, comments, kept } = await fromDocx(await wordFile());
    expect(kept).toBe(2);
    expect(allText(content).match(/Moved text/g)).toHaveLength(1);
    const keptBodies = comments.filter((c) => c.id.startsWith("c-k")).map((c) => [c.body, c.quote]);
    expect(keptBodies).toEqual([
      ["Row inserted by Ana.", "Row two"],
      ["Moved by Cy.", "Moved text"],
    ]);
    expect(texts(content)).not.toContain("Moved text");
  });

  it("brings Word's formatting changes in as formatting suggestions that accept and reject exactly", async () => {
    const { content } = await fromDocx(await wordFile());
    const changes = listChanges(content).filter((c) => c.kind === "format");
    expect(changes.map((c) => [c.text, c.format, c.author])).toEqual([
      ["Bold now", "Bold", "Dee"],
      [" plain again", "Not italic", "Dee"],
      ["Now a heading", "Heading 1", "Eve"],
    ]);
    const accepted = acceptAll(content);
    const rejected = rejectAll(content);
    const para = (c: JSONContent, t: string) => c.content!.find((b) => nodeText(b) === t || nodeText(b).startsWith(t))!;
    expect(para(accepted, "Bold now").content!.map((n) => (n.marks ?? []).map((m) => m.type))).toEqual([["bold"], []]);
    expect(para(rejected, "Bold now").content!.map((n) => (n.marks ?? []).map((m) => m.type))).toEqual([[], ["italic"]]);
    expect(para(accepted, "Now a heading").type).toBe("heading");
    expect(para(rejected, "Now a heading").type).toBe("paragraph");
  });

  it("export-docx: writes comments and suggestions Word reads, and they come back the same", async () => {
    const T = "2026-10-03T10:00:00.000Z";
    const doc = createDocument({
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Keep " },
              { type: "text", text: "this", marks: [{ type: "comment", attrs: { id: "t1" } }] },
              { type: "text", text: " and", marks: [{ type: "comment", attrs: { id: "t1" } }, { type: "insertion", attrs: { id: "s1", author: "Ana", time: T } }] },
              { type: "text", text: " that", marks: [{ type: "deletion", attrs: { id: "s2", author: "Ben", time: T } }] },
            ],
          },
          { type: "paragraph", content: [{ type: "text", text: "Second", marks: [{ type: "comment", attrs: { id: "t2" } }] }] },
          { type: "paragraph", content: [{ type: "text", text: "Now bold", marks: [{ type: "bold" }, { type: "formatChange", attrs: { id: "s3", author: "Cy", time: T, old: [] } }] }] },
          { type: "heading", attrs: { level: 2, formatChange: { id: "s4", author: "Cy", time: T, old: { type: "paragraph", attrs: {} } } }, content: [{ type: "text", text: "Was a paragraph" }] },
        ],
      },
      comments: [
        { id: "t1", author: "Ana Lee", created: T, body: "Is this right?\nSecond line", resolved: false, quote: "this and", replies: [{ id: "r1", author: "Ben", created: T, body: "Yes." }] },
        { id: "t2", author: "Cy", created: T, body: "Done", resolved: true, quote: "Second", replies: [] },
        { id: "gone", author: "Cy", created: T, body: "On deleted text", resolved: false, quote: "x", replies: [] },
      ],
    });
    const file = await toDocx(doc);
    const zip = await JSZip.loadAsync(file);
    expect(await zip.file("word/comments.xml")!.async("string")).toContain("Is this right?");
    expect(zip.file("word/commentsExtended.xml")).toBeTruthy();
    const back = await fromDocx(file);
    expect(back.kept).toBe(0);
    expect(back.comments.map((c) => ({ author: c.author, body: c.body, resolved: c.resolved, quote: c.quote, created: c.created, replies: c.replies.map((r) => [r.author, r.body]) }))).toEqual([
      { author: "Ana Lee", body: "Is this right?\nSecond line", resolved: false, quote: "this and", created: T, replies: [["Ben", "Yes."]] },
      { author: "Cy", body: "Done", resolved: true, quote: "Second", created: T, replies: [] },
    ]);
    expect(texts(acceptAll(back.content))).toEqual(["Keep this and", "Second", "Now bold", "Was a paragraph"]);
    expect(texts(rejectAll(back.content))).toEqual(["Keep this that", "Second", "Now bold", "Was a paragraph"]);
    expect(listChanges(back.content).filter((c) => c.kind === "format").map((c) => [c.text, c.format, c.author, c.time])).toEqual([
      ["Now bold", "Bold", "Cy", T],
      ["Was a paragraph", "Heading 2", "Cy", T],
    ]);
    expect(rejectAll(back.content).content!.slice(2).map((b) => [b.type, (b.content![0]!.marks ?? []).map((m) => m.type)])).toEqual([
      ["paragraph", []],
      ["paragraph", []],
    ]);
    expect(acceptAll(back.content).content!.slice(2).map((b) => [b.type, (b.content![0]!.marks ?? []).map((m) => m.type)])).toEqual([
      ["paragraph", ["bold"]],
      ["heading", []],
    ]);
    const ins = back.content.content![0]!.content!.find((n) => n.marks?.some((m) => m.type === "insertion"))!;
    expect(ins.marks!.find((m) => m.type === "insertion")!.attrs).toMatchObject({ author: "Ana" });
  });

  it("leaves a file without review parts as it was", async () => {
    const { comments, kept } = await fromDocx(await toDocx(createDocument({ content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Plain" }] }] } })));
    expect(comments).toEqual([]);
    expect(kept).toBe(0);
  });
});
