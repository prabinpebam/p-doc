import { diskText, editor, expect, launch, PROMPTLY, quit, test } from "./helpers.ts";

test("first run: Use offline makes the library and opens a new document ready for typing", async () => {
  const l = await launch({ setup: false });
  const { page } = l;
  await expect(page.getByRole("heading", { name: "Welcome to P-Doc" })).toBeVisible();
  await expect(page.getByText("Write documents you own. Every version kept, online or not.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Setup steps" }).locator("li[aria-current=step]")).toHaveText("Welcome");
  await expect(page.getByRole("button", { name: "Connect GitHub" })).toBeFocused();
  // Connect GitHub leads into the steps; Back returns to Welcome without setting anything up.
  await page.getByRole("button", { name: "Connect GitHub" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to GitHub" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Git" })).toBeVisible();
  await expect(page.getByText(/^Git .+ is ready to keep versions\.$/)).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to P-Doc" })).toBeVisible();
  await page.getByRole("button", { name: "Use offline" }).click();
  await expect(editor(page)).toBeFocused();
  await expect(page.locator("#doc-title")).toHaveValue("Untitled document");
  await page.keyboard.type("Hello from the first run");
  await expect.poll(() => diskText(l.dirs), PROMPTLY).toContain("Hello from the first run");
  await expect(page.getByTestId("save-state")).toHaveText("Saved to this computer");
  await page.screenshot({ path: "../../test-results/desktop/smoke.png" });
  await quit(l);
});
