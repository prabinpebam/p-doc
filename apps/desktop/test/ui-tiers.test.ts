/**
 * Component discipline, enforced: the UI is built in tiers (0 foundations, 1 primitives, 2 components,
 * 3 patterns), each depending only on the tiers below it; the lower tiers document themselves and never
 * reach into the app; fundamentals are sealed; and no view falls back to the browser's own select.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const renderer = resolve(here, "../src/renderer");
const ui = join(renderer, "ui");
const TIERS = { foundations: 0, primitives: 1, components: 2, patterns: 3 } as const;
type Folder = keyof typeof TIERS;

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
const folderOf = (file: string): Folder | undefined => {
  const rel = relative(ui, file);
  if (rel.startsWith("..")) return undefined;
  return rel.split(sep)[0] as Folder;
};
const importsOf = (file: string) =>
  [...readFileSync(file, "utf8").matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)].map((m) =>
    resolve(dirname(file), m[1]!),
  );

const uiFiles = walk(ui);

describe("UI tiers", () => {
  it("keeps every UI file in a tier folder", () => {
    const loose = uiFiles.filter((f) => !(folderOf(f)! in TIERS)).map((f) => relative(ui, f));
    expect(loose).toEqual([]);
  });

  it("imports only from lower tiers (patterns may compose patterns)", () => {
    const bad: string[] = [];
    for (const file of uiFiles) {
      const tier = TIERS[folderOf(file)!];
      for (const target of importsOf(file)) {
        const to = folderOf(target);
        const name = `${relative(ui, file)} -> ${relative(renderer, target)}`;
        if (to === undefined) {
          if (tier < 3) bad.push(`${name} (tier ${tier} reaches into the app)`);
          continue;
        }
        const t = TIERS[to];
        if (t > tier || (t === tier && tier === 1) || (t === tier && tier === 2)) bad.push(`${name} (tier ${tier} -> ${t})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("documents every foundation, primitive and component with its tier", () => {
    const bad: string[] = [];
    for (const file of uiFiles) {
      const folder = folderOf(file)!;
      const tier = TIERS[folder];
      if (tier > 2) continue;
      const head = /^\s*\/\*\*([\s\S]*?)\*\//.exec(readFileSync(file, "utf8"))?.[1] ?? "";
      if (!head.includes(`@tier ${tier}`)) bad.push(`${relative(ui, file)}: no "@tier ${tier}" doc comment`);
      if (tier > 0 && !head.includes("@a11y")) bad.push(`${relative(ui, file)}: no "@a11y" in its doc comment`);
    }
    expect(bad).toEqual([]);
  });

  it("seals the primitives: no className or style props", () => {
    const bad = uiFiles
      .filter((f) => folderOf(f) === "primitives")
      .filter((f) => /^\s*(className|style)\??\s*:/m.test(readFileSync(f, "utf8")))
      .map((f) => relative(ui, f));
    expect(bad).toEqual([]);
  });

  it("never renders the browser's own select", () => {
    const bad = walk(renderer)
      .filter((f) => /<select[\s>]|createElement\(\s*["']select["']/.test(readFileSync(f, "utf8")))
      .map((f) => relative(renderer, f));
    expect(bad).toEqual([]);
  });
});
