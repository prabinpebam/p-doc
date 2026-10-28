#!/usr/bin/env node
// Runs a RES script with Windows paths normalised to "/".
// The upstream scripts key files as "rules/x.md" but build keys with path.relative,
// which yields "rules\x.md" on Windows. Usage: node res.mjs <script> [args...]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [script, ...args] = process.argv.slice(2);
if (!script) {
  console.error('Usage: node res.mjs <check-kb|build-report|pack-kb> [args...]');
  process.exit(2);
}
const scriptsDir = resolve(here, '../../.refs/res/skills/reverse-engineering-saas/scripts');
const source = readFileSync(join(scriptsDir, `${script}.mjs`), 'utf8');
const patched = source.replace(/relative\(([^()]+)\)/g, "relative($1).split('\\\\').join('/')");
const outDir = join(here, '.cache', 'res');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${script}.mjs`);
writeFileSync(out, patched);
const result = spawnSync(process.execPath, [out, ...args], { stdio: 'inherit' });
process.exit(result.status ?? 1);
