#!/usr/bin/env node
// Copies generated research reports into the Slate site (docs/research), which only serves docs/.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'research');
mkdirSync(out, { recursive: true });
for (const [kb, name] of [['re-google-docs', 'google-docs-report.html'], ['re-microsoft-word', 'microsoft-word-report.html']]) {
  copyFileSync(join(root, 'research', kb, 'REPORT.html'), join(out, name));
  console.log(`docs/research/${name}`);
}
copyFileSync(join(root, 'research', 're-google-docs', 'evidence', 'EV-001-editor-view-anonymous.png'), join(out, 'gd-editor.png'));
