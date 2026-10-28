import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "../../test-results/desktop",
  snapshotPathTemplate: "{testDir}/baselines/{platform}/{arg}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled", caret: "hide" } },
});
