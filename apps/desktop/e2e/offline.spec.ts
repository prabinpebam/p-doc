import { editor, expect, launch, quit, test } from "./helpers.ts";

test("1.10 stage 1 makes no network request: every load is the app's own file, data or blob", async () => {
  const l = await launch();
  const { page, app } = l;
  await app.evaluate(({ session }) => {
    const g = globalThis as unknown as { __urls: string[] };
    g.__urls = [];
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
      g.__urls.push(d.url);
      cb({});
    });
  });
  const seen: string[] = [];
  page.on("request", (r) => seen.push(r.url()));

  // A stage-1 session: write, structure, find, search commands, the library, a second document.
  await page.keyboard.type("Offline title");
  await page.keyboard.press("Control+Alt+1");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Body text with a link to example.com");
  await page.keyboard.press("Control+f");
  await page.keyboard.type("text");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Alt+/");
  await page.keyboard.type("word count");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Word count" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+o");
  await expect(page.locator("#library-search")).toBeFocused();
  await page.keyboard.press("Control+n");
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type("Second document");
  await page.waitForTimeout(1200);

  const urls = [...seen, ...(await app.evaluate(() => (globalThis as unknown as { __urls: string[] }).__urls))];
  const outside = urls.filter((u) => !/^(file|data|blob|devtools|chrome-extension|chrome):/i.test(u));
  expect(outside, `requests outside the app: ${outside.join(", ")}`).toEqual([]);
  await quit(l);
});
