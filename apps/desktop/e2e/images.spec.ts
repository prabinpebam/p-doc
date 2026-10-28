import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { load, png } from "./fixtures.ts";
import { diskText, editor, expect, launch, PROMPTLY, quit, test } from "./helpers.ts";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const assetsIn = (library: string) => {
  const dir = join(library, "private", "assets");
  return existsSync(dir) ? readdirSync(dir).sort() : [];
};

/** Hands the page a file as the clipboard or a drop would, through the real paste and drop handling. */
async function sendFile(page: Page, how: "paste" | "drop", bytes: Buffer, name: string, at?: { x: number; y: number }) {
  await page.evaluate(
    ({ how, b64, name, at }) => {
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([data], name, { type: "image/png" }));
      const target = document.querySelector(".pd-content")!;
      if (how === "paste") target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      else {
        const o = { dataTransfer: dt, clientX: at!.x, clientY: at!.y, bubbles: true, cancelable: true };
        target.dispatchEvent(new DragEvent("dragover", o));
        target.dispatchEvent(new DragEvent("drop", o));
      }
    },
    { how, b64: bytes.toString("base64"), name, at },
  );
}

async function command(page: Page, words: string, name: string) {
  await page.keyboard.press("Alt+/");
  const palette = page.getByRole("dialog", { name: "Command search" });
  await page.keyboard.type(words);
  await expect(palette.getByRole("option").first()).toContainText(name);
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
}

/** Drags from the middle of a handle by (dx, dy) with the mouse, holding Shift if asked. */
async function drag(page: Page, handle: Locator, dx: number, dy: number, shift = false) {
  const b = (await handle.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}

const box = async (l: Locator) => (await l.boundingBox())!;
const num = async (l: Locator, attr: string) => Number((await l.getAttribute(attr)) ?? Number.NaN);

test("7.1 7.4 7.6 images: insert, paste and drop store each picture once; resize, wrap, align, crop, replace and alt text by mouse and keyboard survive reopen and export", async ({}, info) => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-images-"));
  const blue = png(400, 300, [60, 110, 220]);
  const red = png(200, 200, [210, 70, 60]);
  writeFileSync(join(saveDir, "blue.png"), blue);
  writeFileSync(join(saveDir, "red.png"), red);
  // Over 20 MB: refused before it's read.
  writeFileSync(join(saveDir, "huge.png"), Buffer.concat([blue.subarray(0, 64), Buffer.alloc(20 * 1024 * 1024 + 1)]));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page, dirs } = l;
  const ed = editor(page);
  await page.locator("#doc-title").fill("Images");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Words before the pictures.");
  await page.keyboard.press("Enter");

  // Insert > Image… stores the file once in assets/ under its hash; the document refers to it by path.
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: /^Image…/ }).click();
  await (await chooser).setFiles(join(saveDir, "blue.png"));
  const images = ed.locator(".pd-img");
  await expect(images).toHaveCount(1);
  await expect(images.first().locator("img")).toHaveAttribute("src", `pdoc-asset://a/${sha(blue)}.png`);
  await expect(images.first().locator("img")).toHaveAttribute("alt", "blue");
  await expect.poll(() => diskText(dirs), PROMPTLY).toContain(`"src":"assets/${sha(blue)}.png"`);
  expect(assetsIn(dirs.library)).toEqual([`${sha(blue)}.png`]);
  expect(readFileSync(join(dirs.library, "private", "assets", `${sha(blue)}.png`)).equals(blue)).toBe(true);
  expect(diskText(dirs)).not.toContain("data:image");

  // The same picture pasted is the same file; a dropped one lands where it's dropped.
  await page.keyboard.press("Control+End");
  await sendFile(page, "paste", blue, "pasted.png");
  await expect(images).toHaveCount(2);
  const words = await box(ed.locator("p").first());
  await sendFile(page, "drop", red, "red.png", { x: words.x + 4, y: words.y + words.height / 2 });
  await expect(images).toHaveCount(3);
  await expect.poll(() => assetsIn(dirs.library)).toEqual([`${sha(blue)}.png`, `${sha(red)}.png`].sort());
  await expect.poll(() => (diskText(dirs).match(/"src":"assets\//g) ?? []).length, PROMPTLY).toBe(3);

  // Larger than 20 MB is refused, in so many words.
  await page.locator("#image-file").setInputFiles(join(saveDir, "huge.png"));
  await expect(page.getByText("This image is larger than 20 MB. Make it smaller and try again.")).toBeVisible();
  await expect(images).toHaveCount(3);

  // Select the inserted picture: the image bar shows over it.
  const pic = ed.locator('.pd-img:has(img[alt="blue"])');
  const frame = pic.locator(".pd-img-frame");
  await pic.locator("img").click();
  const bar = page.getByTestId("image-bar");
  await expect(bar).toBeVisible();
  await expect(pic).toHaveClass(/ProseMirror-selectednode/);
  await page.screenshot({ path: info.outputPath("image-bar.png") });

  // A corner keeps the proportions; with Shift it frees them.
  const before = await box(frame);
  await drag(page, pic.locator('.pd-img-handle[data-corner="se"]'), -100, -10);
  await expect.poll(() => num(pic, "data-width")).toBeLessThan(before.width - 80);
  const kept = await box(frame);
  expect(kept.height / kept.width).toBeCloseTo(300 / 400, 1);
  expect(await pic.getAttribute("data-height")).toBeNull();
  await drag(page, pic.locator('.pd-img-handle[data-corner="se"]'), 0, 60, true);
  await expect.poll(() => pic.getAttribute("data-height")).not.toBeNull();
  const freed = await box(frame);
  expect(freed.height / freed.width).toBeGreaterThan(300 / 400 + 0.1);

  // Wrap and alignment from the bar.
  await bar.locator('[data-command="image.wrapLeft"]').click();
  await expect(pic).toHaveAttribute("data-wrap", "left");
  await expect(bar.locator('[data-command="image.alignRight"]')).toBeDisabled();
  await bar.locator('[data-command="image.inline"]').click();
  await expect(pic).toHaveAttribute("data-wrap", "inline");
  await bar.locator('[data-command="image.alignRight"]').click();
  await expect(pic).toHaveAttribute("data-align", "right");
  await bar.locator('[data-command="image.resetSize"]').click();
  await expect(pic).not.toHaveAttribute("data-width");

  // Crop by mouse: drag an edge in, Enter keeps it; Esc puts back what was there.
  await bar.locator('[data-command="image.crop"]').click();
  await expect(pic).toHaveClass(/is-cropping/);
  await expect(bar.getByRole("button", { name: "Keep crop" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("crop.png") });
  await drag(page, pic.locator('.pd-crop-handle[data-edge="w"]'), 80, 0);
  await page.keyboard.press("Enter");
  await expect(pic).not.toHaveClass(/is-cropping/);
  const crop = JSON.parse((await pic.getAttribute("data-crop"))!) as { x: number; w: number };
  expect(crop.x).toBeGreaterThan(0.1);
  expect(crop.w).toBeLessThan(0.9);
  await bar.locator('[data-command="image.crop"]').click();
  await drag(page, pic.locator('.pd-crop-handle[data-edge="n"]'), 0, 60);
  await page.keyboard.press("Escape");
  await expect(pic).not.toHaveClass(/is-cropping/);
  expect(JSON.parse((await pic.getAttribute("data-crop"))!)).toEqual(crop);
  await expect(pic).toHaveClass(/ProseMirror-selectednode/);

  // The keyboard way: command search, the alt text and options dialogs.
  await command(page, "reset crop", "Reset crop");
  await expect(pic).not.toHaveAttribute("data-crop");
  await command(page, "alt text", "Alt text");
  const alt = page.getByRole("dialog", { name: "Alt text" });
  await alt.getByLabel("Describe this image for people who can't see it.").fill("A blue test image");
  await alt.getByRole("button", { name: "Apply" }).click();
  const described = ed.locator('.pd-img:has(img[alt="A blue test image"])');
  await expect(described).toHaveCount(1);
  await command(page, "image options", "Image options");
  const options = page.getByRole("dialog", { name: "Image options" });
  await options.getByLabel(/^Width/).fill("2");
  await options.getByLabel(/^Crop left/).fill("10");
  await options.getByRole("button", { name: "Apply" }).click();
  await expect(described).toHaveAttribute("data-width", "192");
  expect(JSON.parse((await described.getAttribute("data-crop"))!).x).toBeCloseTo(0.1, 2);

  // Replace keeps the size, alignment and alt text, and starts uncropped.
  const replacing = page.waitForEvent("filechooser");
  await bar.locator('[data-command="image.replace"]').click();
  await (await replacing).setFiles(join(saveDir, "red.png"));
  await expect(described.locator("img")).toHaveAttribute("src", `pdoc-asset://a/${sha(red)}.png`);
  await expect(described).toHaveAttribute("data-width", "192");
  await expect(described).toHaveAttribute("data-align", "right");
  await expect(described).not.toHaveAttribute("data-crop");

  // Drag a picture by the mouse to a new place: it moves there, the same picture with the same settings.
  const order = () =>
    page.evaluate(() =>
      ((window as unknown as { __pdoc: { getEditor(): { getJSON(): { content: { type: string; attrs?: { alt?: string } }[] } } } }).__pdoc.getEditor().getJSON().content).map((n) => (n.type === "image" ? `img:${n.attrs?.alt}` : n.type)),
    );
  const was = await order();
  expect(was.indexOf("img:A blue test image")).toBeGreaterThan(1);
  await described.locator("img").click();
  const from = await box(described.locator(".pd-img-frame"));
  const to = await box(ed.locator("p").first());
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 20, { steps: 4 });
  await page.mouse.move(to.x + 2, to.y + 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await order()).indexOf("img:A blue test image")).toBeLessThan(2);
  expect((await order()).filter((n) => n.startsWith("img:")).length).toBe(3);
  await expect(described).toHaveAttribute("data-width", "192");
  await expect(described).toHaveAttribute("data-align", "right");

  // Move to Public counts the images that would go with it (two pictures, three images).
  await page.keyboard.press("Escape");
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Move to Public" }).click();
  const warn = page.getByRole("dialog", { name: 'Make "Images" public?' });
  await expect(warn.getByTestId("move-images")).toHaveText("Its 2 images become public too.");
  await warn.getByRole("button", { name: "Cancel" }).click();

  // Exports carry the pictures: Word has them as media, the web page inline with their alt text.
  await expect.poll(() => diskText(dirs), PROMPTLY).toContain("A blue test image");
  for (const [item, ext] of [[/^Microsoft Word/, "docx"], [/^Web page/, "html"]] as const) {
    await page.getByRole("menuitem", { name: "File" }).click();
    await page.getByRole("menuitem", { name: /^Download/ }).click();
    await page.getByRole("menuitem", { name: item }).click();
    await expect(page.getByText(`Saved Images.${ext}`)).toBeVisible();
  }
  const docx = readFileSync(join(saveDir, "Images.docx")).toString("latin1");
  expect(docx.match(/word\/media\/[^\s"]+\.png/g)?.length).toBeGreaterThanOrEqual(2);
  const html = readFileSync(join(saveDir, "Images.html"), "utf8");
  expect(html.match(/<img[^>]+src="data:image\/png;base64,/g)?.length).toBe(3);
  expect(html).toContain('alt="A blue test image"');
  expect(html).not.toContain("pdoc-asset:");
  expect(html).not.toContain("pd-img-handle");

  // Reopen: every image is back with its size, alignment and alt text.
  await quit(l);
  // A newer P-Doc's file, as a second computer might sync it here (A18).
  const future = join(dirs.library, "private", "docs", "future-doc.pdoc.json");
  const futureText = `${JSON.stringify({ format: "p-doc", version: 99, id: "future", title: "Future plan", created: "2027-01-01T00:00:00.000Z", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "From the future." }] }, { type: "footnote", attrs: { n: 1 } }] } }, null, 2)}\n`;
  writeFileSync(future, futureText);
  const again = await launch({ dirs, env: { PDOC_SAVE_DIR: saveDir } });
  const ed2 = editor(again.page);
  await expect(ed2.locator(".pd-img")).toHaveCount(3);
  const back = ed2.locator('.pd-img:has(img[alt="A blue test image"])');
  await expect(back).toHaveAttribute("data-width", "192");
  await expect(back).toHaveAttribute("data-align", "right");
  await expect(back.locator("img")).toHaveAttribute("src", `pdoc-asset://a/${sha(red)}.png`);
  await expect.poll(() => back.locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(200);

  // A picture whose file is gone shows "Image missing"; the rest of the document works.
  await load(again.page, {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Above the missing picture." }] },
      { type: "image", attrs: { src: `assets/${"0".repeat(64)}.png`, alt: "Gone" } },
      { type: "paragraph", content: [{ type: "text", text: "Below it" }] },
    ],
  });
  await expect(ed2.locator(".pd-img.is-missing")).toHaveCount(1);
  await expect(ed2.getByText("Image missing")).toBeVisible();
  await again.page.screenshot({ path: info.outputPath("missing.png") });
  await ed2.getByText("Below it").click();
  await again.page.keyboard.press("End");
  await again.page.keyboard.type(", still editable.");
  await expect(ed2).toContainText("Below it, still editable.");
  await expect.poll(() => diskText(dirs), PROMPTLY).toContain("Below it, still editable.");
  // Exports leave the missing picture out and keep everything else.
  await again.page.getByRole("menuitem", { name: "File" }).click();
  await again.page.getByRole("menuitem", { name: /^Download/ }).click();
  await again.page.getByRole("menuitem", { name: /^Web page/ }).click();
  await expect(again.page.getByText("Saved Images.html")).toBeVisible();
  const left = readFileSync(join(saveDir, "Images.html"), "utf8");
  expect(left).toContain("Below it, still editable.");
  expect(left).not.toContain("<img");

  // The newer file opens read-only and is left as it was.
  await again.page.keyboard.press("Control+o");
  await again.page.getByRole("list", { name: /Private/ }).getByRole("button", { name: /^Future plan/ }).click();
  await expect(again.page.getByTestId("lock-banner")).toHaveText("Made with a newer P-Doc. Update to edit it.");
  await expect(ed2).toContainText("From the future.");
  await expect(ed2).toHaveAttribute("contenteditable", "false");
  await ed2.getByText("From the future.").click();
  await again.page.keyboard.type("changed");
  await expect(ed2).not.toContainText("changed");
  await quit(again);
  expect(readFileSync(future, "utf8")).toBe(futureText);
});
