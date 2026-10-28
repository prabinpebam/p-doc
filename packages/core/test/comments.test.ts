import { describe, expect, it } from "vitest";
import { addReply, commentAnchors, editComment, finalContent, newThread, removeComment, schema, setResolved, toText } from "../src/index.ts";

const t0 = new Date("2026-10-28T10:00:00Z");
const t1 = new Date("2026-10-28T11:00:00Z");

const doc = () =>
  schema().nodeFromJSON({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "One " }, { type: "text", text: "two", marks: [{ type: "comment", attrs: { id: "c-a" } }] }, { type: "text", text: " three" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "four", marks: [{ type: "comment", attrs: { id: "c-b" } }] },
          { type: "text", text: " five", marks: [{ type: "bold" }, { type: "comment", attrs: { id: "c-b" } }] },
        ],
      },
    ],
  });

describe("comments", () => {
  it("finds each thread's text in document order, across formatting", () => {
    const a = commentAnchors(doc());
    expect([...a.keys()]).toEqual(["c-a", "c-b"]);
    expect(a.get("c-a")).toMatchObject({ from: 5, to: 8, text: "two" });
    expect(a.get("c-b")!.text).toBe("four five");
    expect(a.get("c-b")!.from).toBeGreaterThan(a.get("c-a")!.to);
  });

  it("a thread whose text is gone has no anchor", () => {
    expect(commentAnchors(schema().nodeFromJSON({ type: "doc", content: [{ type: "paragraph" }] })).size).toBe(0);
  });

  it("adds, replies, edits, resolves, reopens and deletes", () => {
    let list = [newThread("Ann", "  Is this right? ", "two", "c-a", t0)];
    expect(list[0]).toEqual({ id: "c-a", author: "Ann", created: t0.toISOString(), body: "Is this right?", resolved: false, quote: "two", replies: [] });

    list = addReply(list, "c-a", "Ben", "Yes.", t1);
    const r = list[0]!.replies[0]!;
    expect(r).toMatchObject({ author: "Ben", body: "Yes.", created: t1.toISOString() });
    expect(r.id).toMatch(/^r-[0-9a-f]{10}$/);

    list = editComment(list, "c-a", null, "Is this right now?", t1);
    expect(list[0]).toMatchObject({ body: "Is this right now?", edited: t1.toISOString() });
    list = editComment(list, "c-a", r.id, "Yes, it is.", t1);
    expect(list[0]!.replies[0]).toMatchObject({ body: "Yes, it is.", edited: t1.toISOString() });

    list = setResolved(list, "c-a", true);
    expect(list[0]!.resolved).toBe(true);
    list = setResolved(list, "c-a", false);
    expect(list[0]!.resolved).toBe(false);

    list = removeComment(list, "c-a", r.id);
    expect(list[0]!.replies).toEqual([]);
    list = removeComment(list, "c-a");
    expect(list).toEqual([]);
  });

  it("leaves other threads alone", () => {
    const list = [newThread("Ann", "A", "a", "c-a", t0), newThread("Ann", "B", "b", "c-b", t0)];
    const next = setResolved(addReply(list, "c-b", "Ann", "re", t1), "c-b", true);
    expect(next[0]).toBe(list[0]);
    expect(removeComment(next, "c-x")).toEqual(next);
  });

  it("exports drop comment anchors but keep their text", () => {
    const final = finalContent(doc().toJSON());
    expect(JSON.stringify(final)).not.toContain('"comment"');
    expect(toText(final)).toContain("One two three");
  });
});
