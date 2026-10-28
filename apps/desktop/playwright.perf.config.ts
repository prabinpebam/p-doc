import { defineConfig } from "@playwright/test";

/** `pnpm perf`: the waits of spec §7 against their budgets, recorded in docs/product/perf-baseline.json. */
export default defineConfig({
  testDir: "perf",
  timeout: 300_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "../../test-results/perf",
});
