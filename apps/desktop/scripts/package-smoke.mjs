// Launches the packaged app (release/win-unpacked) with its own data and library folders and checks
// from its log that the window loaded with no renderer error. Fuses block debuggers in packaged
// builds, so the log is the evidence. Run after `electron-builder --dir`.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const exe = resolve(import.meta.dirname, "../release/win-unpacked/p-doc.exe");
if (!existsSync(exe)) {
  console.error(`No packaged app at ${exe}. Run: pnpm --filter @p-doc/desktop exec electron-builder --dir`);
  process.exit(1);
}
const root = mkdtempSync(join(tmpdir(), "pdoc-smoke-"));
const env = { ...process.env };
for (const k of Object.keys(env)) if (k.startsWith("PDOC_") || k.startsWith("GIT_")) delete env[k];
Object.assign(env, {
  PDOC_USER_DATA: join(root, "data"),
  PDOC_LIBRARY: join(root, "library"),
  PDOC_E2E: "1",
  GIT_CONFIG_GLOBAL: join(root, "gitconfig"),
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
});
const logFile = join(root, "data", "logs", "main.log");
const started = Date.now();
const child = spawn(exe, [], { env, stdio: ["ignore", "pipe", "pipe"] });
const out = [];
child.stdout.on("data", (d) => out.push(String(d)));
child.stderr.on("data", (d) => out.push(String(d)));
let exited = false;
child.on("exit", () => (exited = true));

const read = () => (existsSync(logFile) ? readFileSync(logFile, "utf8") : "");
let text = "";
let shownAfter = 0;
while (Date.now() - started < 20_000 && !exited) {
  text = read();
  if (text.includes("window loaded")) {
    shownAfter = Date.now() - started;
    break;
  }
  await new Promise((r) => setTimeout(r, 200));
}
// Give the renderer a moment to report errors after the first paint.
await new Promise((r) => setTimeout(r, 2_000));
text = read();
const exitedEarly = exited;
if (!exited) child.kill();
await new Promise((r) => setTimeout(r, 500));
rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

const problems = [];
if (!text.includes(" start ")) problems.push("no start line");
if (!text.includes("window loaded")) problems.push("window never loaded");
for (const l of text.split("\n")) if (/renderer (error|gone)|failed to load/.test(l)) problems.push(l.trim());
if (exitedEarly) problems.push(`the app exited early. Its output:\n${out.join("").slice(-2000)}`);
console.log(text.trim());
if (problems.length) {
  console.error(`Package smoke failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`Package smoke passed: window loaded ${(shownAfter / 1000).toFixed(1)} s after launch, no renderer errors.`);
