import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { diskText, editor, expect, launch, PROMPTLY, quit, test } from "./helpers.ts";

test("1.9 a forced quit with unsaved typing loses nothing: the next start restores it", async () => {
  // The save waits a minute, so only the recovery copy can hold the text when the app is killed.
  const env = { PDOC_SAVE_DELAY_MS: "60000" };
  const l = await launch({ env });
  const { page } = l;
  await page.keyboard.type("Words that only recovery holds");
  await expect(page.getByTestId("save-state")).toHaveText("Saving…");
  const recoveryDir = join(l.dirs.userData, "recovery");
  await expect.poll(() => (existsSync(recoveryDir) ? readdirSync(recoveryDir).length : 0), PROMPTLY).toBeGreaterThan(0);
  expect(diskText(l.dirs)).not.toContain("Words that only recovery holds");

  process.kill(l.pid, "SIGKILL");
  await l.app.waitForEvent("close").catch(() => undefined);

  const again = await launch({ dirs: l.dirs });
  await expect(editor(again.page)).toContainText("Words that only recovery holds");
  await expect(again.page.getByText(/Recovered unsaved changes to/)).toBeVisible();
  expect(diskText(l.dirs)).toContain("Words that only recovery holds");
  expect(readdirSync(recoveryDir).length).toBe(0);
  await quit(again);
});
