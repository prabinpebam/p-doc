import { describe, expect, it } from "vitest";
import { groupVersions, type VersionInfo } from "../src/group.ts";

const now = new Date(2026, 9, 28, 15, 0);
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString();
const v = (sha: string, time: string, name?: string | null): VersionInfo => ({ sha, time, author: "Writer", message: "Edit", name });

describe("groupVersions", () => {
  const all = [v("a", at(25, 9)), v("b", at(28, 9)), v("c", at(27, 23, 59), "First draft"), v("d", at(28, 14, 30)), v("e", at(28, 0, 0), "Morning")];

  it("groups by day, newest first: Today, Yesterday, then dates", () => {
    const g = groupVersions(all, now);
    expect(g.map((x) => x.label)).toEqual(["Today", "Yesterday", "October 25, 2026"]);
    expect(g[0]!.versions.map((x) => x.sha)).toEqual(["d", "b", "e"]);
    expect(g[1]!.versions.map((x) => x.sha)).toEqual(["c"]);
  });

  it("shows only named versions when asked, dropping empty days", () => {
    const g = groupVersions(all, now, "en-US", true);
    expect(g.map((x) => x.label)).toEqual(["Today", "Yesterday"]);
    expect(g.flatMap((x) => x.versions.map((y) => y.name))).toEqual(["Morning", "First draft"]);
  });

  it("treats the turn of a month and a year as days like any other", () => {
    const g = groupVersions([v("x", new Date(2025, 11, 31, 22).toISOString())], new Date(2026, 0, 1, 8));
    expect(g[0]!.label).toBe("Yesterday");
  });

  it("formats dates in the given locale and returns nothing for no versions", () => {
    expect(groupVersions([v("a", at(25, 9))], now, "en-GB")[0]!.label).toBe("25 October 2026");
    expect(groupVersions([], now)).toEqual([]);
  });
});
