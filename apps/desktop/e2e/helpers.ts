import { _electron as electron, expect, test as base, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Checks every 50 ms for up to 10 s: for things the app does on its own (a save, a recovery copy). */
export const PROMPTLY = { timeout: 10_000, intervals: [50] };

export interface Dirs {
  userData: string;
  library: string;
  gitConfig: string;
}

/** Fresh folders for one journey: P-Doc's data, the library, and an empty Git config (never the owner's). */
export function tempDirs(): Dirs {
  const root = mkdtempSync(join(tmpdir(), "pdoc-e2e-"));
  const gitConfig = join(root, "gitconfig");
  writeFileSync(gitConfig, "");
  return { userData: join(root, "user"), library: join(root, "library"), gitConfig };
}

export interface Launched {
  app: ElectronApplication;
  page: Page;
  dirs: Dirs;
  /** The main process's own ID (on Windows `app.process()` is a launcher). */
  pid: number;
  log: string[];
}

const running = new Map<ElectronApplication, number>();

/** Kills any app a journey left running, by process ID. */
export function killLeftovers(): void {
  for (const [app, pid] of running) {
    running.delete(app);
    for (const id of [pid, (() => { try { return app.process().pid; } catch { return undefined; } })()]) {
      try {
        if (id) process.kill(id, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
  }
}

export interface LaunchOptions {
  dirs?: Dirs;
  env?: Record<string, string>;
  /** Go past first run with "Use offline" when it shows (default true). */
  setup?: boolean;
}

/**
 * Starts P-Doc isolated: its own data and library folders, Git with no system or personal config,
 * and the window shown without taking the computer's focus.
 */
export async function launch(o: LaunchOptions = {}): Promise<Launched> {
  const dirs = o.dirs ?? tempDirs();
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v != null && !k.startsWith("GIT_") && !k.startsWith("PDOC_")) env[k] = v;
  Object.assign(env, {
    PDOC_USER_DATA: dirs.userData,
    PDOC_LIBRARY: dirs.library,
    PDOC_E2E: "1",
    GIT_CONFIG_GLOBAL: dirs.gitConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    ...o.env,
  });
  const app = await electron.launch({ args: [appDir], env, cwd: appDir });
  const pid = await app.evaluate(() => process.pid);
  running.set(app, pid);
  const log: string[] = [];
  logs.push(log);
  app.process().stdout?.on("data", (d: Buffer) => log.push(d.toString()));
  const page = await app.firstWindow();
  page.on("console", (m) => log.push(`[console.${m.type()}] ${m.text()}\n`));
  page.on("pageerror", (e) => log.push(`[pageerror] ${e.message}\n`));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await expect(page.locator(".first-run, [data-testid=app]")).toBeVisible();
  if ((o.setup ?? true) && (await page.locator(".first-run").count())) {
    await page.getByRole("button", { name: "Use offline" }).click();
  }
  if (o.setup ?? true) await expect(page.locator(".pd-content")).toBeVisible();
  return { app, page, dirs, pid, log };
}

/** Closes the window the way a person does: the app saves first. */
export async function quit(l: Launched): Promise<void> {
  await l.app.close();
  running.delete(l.app);
}

/** The page's editable text. */
export const editor = (page: Page) => page.locator(".pd-content");

/** Every document file in a space, parsed. */
export function filesIn(dirs: Dirs, space: "private" | "public", folder = "docs"): { name: string; doc: { title: string; content: unknown } }[] {
  const dir = join(dirs.library, space, folder);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".pdoc.json"))
    .map((name) => ({ name, doc: JSON.parse(readFileSync(join(dir, name), "utf8")) }));
}

/** All text in every document of a space, for "is it on disk" checks. */
export const diskText = (dirs: Dirs, space: "private" | "public" = "private") => filesIn(dirs, space).map((f) => JSON.stringify(f.doc)).join("\n");

/** Every log line of the apps this journey started, attached to a failure. */
const logs: string[][] = [];

export const test = base.extend<{ cleanup: void }>({
  cleanup: [
    async ({}, use, info) => {
      logs.length = 0;
      await use();
      if (info.status !== info.expectedStatus) for (const [i, l] of logs.entries()) await info.attach(`app-${i + 1}.log`, { body: l.join(""), contentType: "text/plain" });
      killLeftovers();
    },
    { auto: true },
  ],
});

/**
 * A dialog that changes the document: once applied it closes, the page has focus again, and one Undo returns the
 * document to how it was (one Redo brings the change back). `read` describes what the dialog changes.
 */
export async function dialogStep<T>(page: Page, o: { open: () => Promise<void>; name: string | RegExp; fill: (dialog: Locator) => Promise<void>; read: () => Promise<T>; apply?: string }): Promise<T> {
  const before = await o.read();
  await o.open();
  const dialog = page.getByRole("dialog", { name: o.name });
  await expect(dialog).toBeVisible();
  await o.fill(dialog);
  await dialog.getByRole("button", { name: o.apply ?? "Apply", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(editor(page)).toBeFocused();
  await expect.poll(o.read, PROMPTLY).not.toEqual(before);
  const after = await o.read();
  await page.keyboard.press("Control+Z");
  await expect.poll(o.read, PROMPTLY).toEqual(before);
  await page.keyboard.press("Control+Y");
  await expect.poll(o.read, PROMPTLY).toEqual(after);
  return after;
}

export { expect };
