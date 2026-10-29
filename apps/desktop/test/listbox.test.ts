import { describe, expect, it } from "vitest";
import { edge, placeList, step, typeahead, type ListOption } from "../src/renderer/ui/foundations/listbox.ts";

const opts = (labels: string, disabled = ""): ListOption[] =>
  labels.split(",").map((label, i) => ({ value: String(i), label, disabled: disabled.split(",").includes(String(i)) }));

describe("listbox keyboard model", () => {
  const fonts = opts("Arial,Calibri,Cambria,Consolas,Georgia,Segoe UI", "2");

  it("steps to the next enabled option and stops at the ends", () => {
    expect(step(fonts, 0, 1)).toBe(1);
    expect(step(fonts, 1, 1)).toBe(3); // skips the disabled Cambria
    expect(step(fonts, 3, -1)).toBe(1);
    expect(step(fonts, 5, 1)).toBe(5);
    expect(step(fonts, 0, -1)).toBe(0);
  });

  it("pages by several options without running off the list", () => {
    expect(step(fonts, 0, 1, 3)).toBe(4);
    expect(step(fonts, 0, 1, 10)).toBe(5);
    expect(step(fonts, 5, -1, 10)).toBe(0);
  });

  it("finds the first and last enabled options", () => {
    expect(edge(fonts, "first")).toBe(0);
    expect(edge(fonts, "last")).toBe(5);
    expect(edge(opts("A,B", "0"), "first")).toBe(1);
    expect(edge(opts("A,B", "0,1"), "last")).toBe(-1);
  });

  it("jumps to the option starting with what was typed", () => {
    expect(typeahead(fonts, 0, "seg")).toBe(5);
    expect(typeahead(fonts, 0, "CON")).toBe(3);
    expect(typeahead(fonts, 0, "x")).toBe(0);
    expect(typeahead(fonts, 2, "")).toBe(2);
  });

  it("cycles through options on the same letter, skipping disabled ones", () => {
    expect(typeahead(fonts, 0, "c")).toBe(1);
    expect(typeahead(fonts, 1, "c")).toBe(3); // Cambria is disabled
    expect(typeahead(fonts, 3, "cc")).toBe(1);
  });

  it("places the list below its control, or above when there is more room there", () => {
    expect(placeList({ top: 100, bottom: 128 }, 200, 800, 4)).toEqual({ top: 132, maxHeight: 664 });
    const above = placeList({ top: 700, bottom: 728 }, 300, 800, 4);
    expect(above).toEqual({ top: 396, maxHeight: 692 });
    expect(placeList({ top: 400, bottom: 428 }, 1000, 800, 4)).toEqual({ top: 4, maxHeight: 392 });
    expect(placeList({ top: 300, bottom: 328 }, 1000, 800, 4)).toEqual({ top: 332, maxHeight: 464 });
  });
});
