import { expect, filesIn, launch, PROMPTLY, quit, test, choose } from "./helpers.ts";
import { load, longDocument, settled } from "./fixtures.ts";

type Saved = { id: string; page: { orientation: string; size: string; color: string; margins: Record<string, number> } };

test("2.6 page setup changes paper, orientation, margins and colour, checks the numbers, and sets the default", async () => {
  const l = await launch();
  const { page } = l;
  await load(page, longDocument());
  const portrait = await settled(page);
  const art = page.getByTestId("page");
  const width = async () => Math.round((await art.boundingBox())!.width);
  const padLeft = () => art.evaluate((el) => Math.round(el.querySelector(".pd-content")!.getBoundingClientRect().left - el.getBoundingClientRect().left));
  expect(await width()).toBe(816);
  expect(await padLeft()).toBe(96);

  const dialog = page.getByRole("dialog", { name: "Page setup" });
  const open = async () => {
    await page.getByRole("menuitem", { name: "File" }).click();
    await page.getByRole("menuitem", { name: "Page setup…" }).click();
    await expect(dialog).toBeVisible();
  };

  // Landscape: wider sheets and more of them.
  await open();
  await dialog.getByLabel("Landscape").check();
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(width).toBe(1056);
  expect(await settled(page)).toBeGreaterThan(portrait);
  await page.screenshot({ path: test.info().outputPath("landscape.png") });

  // Numbers are checked before anything changes.
  await open();
  await dialog.locator('input[name="margin-top"]').fill("-1");
  await expect(dialog.getByText("Enter a margin of 0 or more.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
  await dialog.locator('input[name="margin-top"]').fill("1");
  await dialog.locator('input[name="margin-left"]').fill("6");
  await dialog.locator('input[name="margin-right"]').fill("5");
  await expect(dialog.getByText("The margins leave no room for text. Make them smaller.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(await padLeft()).toBe(96);

  // A4, a 2 inch left margin and a cream page.
  await open();
  await dialog.getByLabel("Portrait").check();
  await choose(dialog.getByLabel("Paper size"), "a4");
  await dialog.locator('input[name="margin-left"]').fill("2");
  await dialog.getByLabel("Page colour").fill("#fff8e1");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect.poll(width).toBe(794);
  await expect.poll(padLeft).toBe(192);
  // The paper is drawn behind the text, sheet by sheet (U55).
  await expect(page.locator(".pd-sheet-bg").first()).toHaveCSS("background-color", "rgb(255, 248, 225)");
  await expect.poll(() => (filesIn(l.dirs, "private")[0]?.doc as unknown as Saved)?.page, PROMPTLY).toMatchObject({ orientation: "portrait", size: "a4", color: "#fff8e1", margins: { left: 2 } });
  const firstId = (filesIn(l.dirs, "private")[0]!.doc as unknown as Saved).id;

  // Set as default: new documents start with this setup; this one is unchanged.
  await open();
  await dialog.locator('input[name="margin-top"]').fill("1.5");
  await dialog.getByRole("button", { name: "Set as default" }).click();
  await expect(page.getByText("New documents will use this page setup.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => (filesIn(l.dirs, "private")[0]?.doc as unknown as Saved)?.page.margins.top, PROMPTLY).toBe(1);

  await page.keyboard.press("Control+n");
  await expect.poll(() => filesIn(l.dirs, "private").length, PROMPTLY).toBe(2);
  const fresh = () => filesIn(l.dirs, "private").map((f) => f.doc as unknown as Saved).find((d) => d.id !== firstId)!;
  expect(fresh().page).toMatchObject({ size: "a4", color: "#fff8e1", margins: { top: 1.5, left: 2 } });
  await expect.poll(width).toBe(794);
  await expect.poll(padLeft).toBe(192);
  await quit(l);
});

test("2.7 new documents take the paper of the computer's region", async () => {
  // A region that uses A4 (India); the other tests run as the United States, so they cover Letter.
  const l = await launch({ env: { PDOC_LOCALE: "en-IN" } });
  const { page } = l;
  await page.keyboard.press("Control+n");
  await expect.poll(() => filesIn(l.dirs, "private").map((f) => (f.doc as unknown as Saved).page.size), PROMPTLY).toContain("a4");
  expect(filesIn(l.dirs, "private").every((f) => (f.doc as unknown as Saved).page.size === "a4")).toBe(true);
  await expect.poll(async () => Math.round((await page.getByTestId("page").boundingBox())?.width ?? 0)).toBe(794);
  await quit(l);
});
