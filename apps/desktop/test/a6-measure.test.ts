/**
 * Assumption A6 (spec §9) and DoD 7.3: how big a 100-page document with 20 images gets, as a file
 * and in Git after 11 versions, now that pictures are stored beside it. Slow and disk-heavy, so it runs only when asked:
 *   $env:PDOC_MEASURE=1; pnpm vitest run apps/desktop/test/a6-measure.test.ts --reporter=verbose
 */
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { git } from "../src/main/git.ts";
import { Library } from "../src/main/library.ts";

const du = (dir: string): number => readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? du(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** A picture as the library sees it: a PNG header and bytes that don't compress, like a photo's. */
function picture(bytes: number): string {
  const head = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head);
  head.writeUInt32BE(13, 8);
  head.write("IHDR", 12, "ascii");
  head.writeUInt32BE(1600, 16);
  head.writeUInt32BE(1200, 20);
  return `data:image/png;base64,${Buffer.concat([head, randomBytes(bytes - head.length)]).toString("base64")}`;
}

describe.runIf(process.env.PDOC_MEASURE === "1")("A6 image storage", () => {
  let home = "";
  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), "pdoc-a6-"));
    writeFileSync(join(home, "gitconfig"), "");
    process.env.GIT_CONFIG_GLOBAL = join(home, "gitconfig");
    process.env.GIT_CONFIG_NOSYSTEM = "1";
  });
  afterAll(() => rmSync(home, { recursive: true, force: true }));

  for (const [label, imageBytes] of [["at 2 MB each", 2 * 1024 * 1024], ["typical 300 KB", 300 * 1024]] as const) {
    it(`20 images ${label}`, async () => {
      const lib = await Library.open(join(home, label.replace(/\W+/g, "-")), { identity: () => ({ name: "T", email: "t@example.invalid" }) });
      await lib.ensure();
      const para = (i: number) => ({ type: "paragraph", content: [{ type: "text", text: `Paragraph ${i} `.repeat(40) }] });
      const blocks: unknown[] = [];
      for (let i = 0; i < 1000; i++) {
        blocks.push(para(i));
        if (i % 50 === 0) blocks.push({ type: "image", attrs: { src: picture(imageBytes) } });
      }
      const made = await lib.create({ title: label, content: { type: "doc", content: blocks } as never });
      const ref = made.summary;
      // Stage 7: the pictures are written beside the document, which only names them.
      const doc = lib.read(ref).doc;
      lib.write(ref, doc);
      await lib.commitDoc(ref);
      const fileSize = statSync(lib.file(ref)).size;
      const assets = du(join(lib.dir("private"), "assets"));
      const first = du(join(lib.dir("private"), ".git"));
      for (let v = 0; v < 10; v++) {
        (doc.content.content as unknown[]).push(para(5000 + v));
        lib.write(ref, doc);
        await lib.commitDoc(ref);
      }
      const loose = du(join(lib.dir("private"), ".git"));
      await git(lib.dir("private"), ["gc", "--quiet"]);
      const packed = du(join(lib.dir("private"), ".git"));
      console.log(`A6 ${label}: file ${mb(fileSize)}; images ${mb(assets)}; .git ${mb(first)} after the first version, +${mb(loose - first)} for 10 text-only versions (${mb(packed)} after git gc)`);
      expect(fileSize).toBeLessThan(1024 * 1024);
      expect(loose - first).toBeLessThan(1024 * 1024);
    }, 300_000);
  }
});
