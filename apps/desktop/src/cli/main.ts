#!/usr/bin/env node
/** The `pdoc` entry: runs one command and exits with its code (see cli.ts). */
import { run } from "./cli.ts";

declare const __PDOC_VERSION__: string | undefined;

const code = await run(process.argv.slice(2), {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
  env: process.env,
  cwd: process.cwd(),
  version: typeof __PDOC_VERSION__ === "string" ? __PDOC_VERSION__ : undefined,
});
process.exitCode = code;
