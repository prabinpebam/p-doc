import { describe, expect, it } from "vitest";
import { VersionCadence, groupVersions } from "../src/index.ts";

describe("cadence", () => {
  it("is due 60 s after the last change", () => {
    const c = new VersionCadence();
    expect(c.due(0)).toBe(false);
    c.change(1000);
    c.change(30_000);
    expect(c.due(89_000)).toBe(false);
    expect(c.wait(89_000)).toBe(1000);
    expect(c.due(90_000)).toBe(true);
    c.committed();
    expect(c.due(200_000)).toBe(false);
    expect(c.wait(0)).toBe(Infinity);
  });

  it("is due every 10 minutes while changes keep coming", () => {
    const c = new VersionCadence();
    for (let t = 0; t <= 600_000; t += 10_000) c.change(t);
    expect(c.due(600_000)).toBe(true);
  });
});

describe("group", () => {
  const now = new Date(2026, 9, 28, 15, 0);
  const at = (d: number, h: number) => new Date(2026, 9, d, h).toISOString();
  const versions = [
    { sha: "a", time: at(28, 9), author: "P", message: "Edit", name: null },
    { sha: "b", time: at(28, 14), author: "P", message: "Edit", name: "Final" },
    { sha: "c", time: at(27, 10), author: "P", message: "Edit" },
    { sha: "d", time: at(20, 10), author: "P", message: "Edit", name: "First draft" },
  ];

  it("groups by Today, Yesterday, then dates, newest first", () => {
    const g = groupVersions(versions, now);
    expect(g.map((x) => x.label)).toEqual(["Today", "Yesterday", "October 20, 2026"]);
    expect(g[0]!.versions.map((v) => v.sha)).toEqual(["b", "a"]);
  });

  it("filters to named versions", () => {
    const g = groupVersions(versions, now, "en-US", true);
    expect(g.flatMap((x) => x.versions.map((v) => v.name))).toEqual(["Final", "First draft"]);
  });
});
