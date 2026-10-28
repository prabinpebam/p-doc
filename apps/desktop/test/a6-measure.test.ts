/**
 * Assumption A6 (spec §9): how big a 100-page document with 20 images gets, as a file and in Git
 * after 11 versions. Slow and disk-heavy, so it runs only when asked:
 *   $env:PDOC_MEASURE=1; pnpm vitest run apps/desktop/test/a6-measure.test.ts --reporter=verbose
 */
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { git } from "../src/main/git.ts";
import { Library } from "../src/main/library.ts";

const du = (dir: string): number => readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? du(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

describe.runIf(process.env.PDOC_MEASURE === "1")("A6 image storage", () => {
  let home = "";
  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), "pdoc-a6-"));
    writeFileSync(join(home, "gitconfig"), "");
    process.env.GIT_CONFIG_GLOBAL = join(home, "gitconfig");
    process.env.GIT_CONFIG_NOSYSTEM = "1";
  });
  afterAll(() => rmSync(home, { recursive: true, force: true }));

  for (const [label, imageBytes] of [["at the 2 MB cap", 2 * 1024 * 1024], ["typical 300 KB", 300 * 1024]] as const) {
    it(`20 images ${label}`, async () => {
      const lib = await Library.open(join(home, label.replace(/\W+/g, "-")), { identity: () => ({ name: "T", email: "t@example.invalid" }) });
      await lib.ensure();
      const para = (i: number) => ({ type: "paragraph", content: [{ type: "text", text: `Paragraph ${i} `.repeat(40) }] });
      const blocks: unknown[] = [];
      for (let i = 0; i < 1000; i++) {
        blocks.push(para(i));
        // Random bytes: a photo's compressed data doesn't compress further.
        if (i % 50 === 0) blocks.push({ type: "image", attrs: { src: `data:image/jpeg;base64,${randomBytes(imageBytes).toString("base64")}` } });
      }
      const made = await lib.create({ title: label, content: { type: "doc", content: blocks } as never });
      const ref = made.summary;
      const fileSize = statSync(lib.file(ref)).size;
      const doc = lib.read(ref).doc;
      for (let v = 0; v < 10; v++) {
        (doc.content.content as unknown[]).push(para(5000 + v));
        lib.write(ref, doc);
        await lib.commitDoc(ref);
      }
      const loose = du(join(lib.dir("private"), ".git"));
      await git(lib.dir("private"), ["gc", "--quiet"]);
      const packed = du(join(lib.dir("private"), ".git"));
      console.log(`A6 ${label}: file ${mb(fileSize)}; .git after 11 versions ${mb(loose)}, ${mb(packed)} after git gc`);
    }, 300_000);
  }
});
