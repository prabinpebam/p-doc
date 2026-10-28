#!/usr/bin/env node
// The review build: the built app at the last validated commit, always running for the owner to try.
//
//   node tools/review-build.mjs refresh [<commit>] [--force]   check out <commit> (default: main) in the review
//                                                              worktree, install, build, and restart it there
//   node tools/review-build.mjs start                          start it at the commit already built
//   node tools/review-build.mjs stop                           close it (the app saves first)
//   node tools/review-build.mjs status                         where it is, which commit, whether it answers
//
// Isolated from development: its own git worktree beside this repository (never the folder being edited),
// its own user-data folder and a demo library (never the owner's real library or settings), an empty Git
// config (so Git never reaches the owner's credential helper) and a GitHub address on this computer where
// nothing listens (so it never reaches GitHub). It opens behind the owner's windows. A refresh never restarts
// it while it's the window in front (the owner is using it) unless --force says the owner agreed.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Where the review build lives: siblings of the repository, never inside it. */
export function reviewPaths(repo = REPO) {
  const worktree = resolve(repo, '..', `${basename(repo)}-review`);
  const data = resolve(repo, '..', `${basename(repo)}-review-data`);
  return {
    worktree,
    app: join(worktree, 'apps', 'desktop'),
    data,
    userData: join(data, 'user-data'),
    library: join(data, 'library'),
    gitConfig: join(data, 'gitconfig'),
    seed: join(data, 'seed'),
    state: join(data, 'state.json'),
  };
}

function basename(p) {
  return resolve(p).split(/[\\/]/).pop();
}

/** The review build's environment: none of the developer's Git or P-Doc settings, all of its own folders. */
export function reviewEnv(paths, base = process.env) {
  const env = {};
  for (const [k, v] of Object.entries(base)) {
    if (v == null || /^(GIT_|PDOC_|ELECTRON_)/i.test(k)) continue;
    env[k] = v;
  }
  return Object.assign(env, {
    PDOC_USER_DATA: paths.userData,
    PDOC_LIBRARY: paths.library,
    PDOC_SHOW_INACTIVE: '1',
    // Nothing listens on port 9: GitHub reads as offline, and a sign-in can't reach the real one.
    PDOC_GITHUB_API: 'http://127.0.0.1:9',
    PDOC_GITHUB_REMOTE: pathToFileURL(join(paths.data, 'remote')).href,
    GIT_CONFIG_GLOBAL: paths.gitConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  });
}

const DEMO = {
  'Welcome to the review build.md': `# Welcome to the review build

This is P-Doc at the last commit whose checks passed. It runs on its own: demo documents in a library of its own, offline, with no link to your GitHub or your real documents. Change anything you like.

## Things to try

- Type, undo and redo; the status says **Saved** once your words are on disk.
- Turn on **Suggesting**, change a word, then accept or reject it in the review panel.
- Add a comment, reply to it and resolve it.
- Open **File > Version history** and compare two versions.
- Export to Word (.docx) and open it in Word.

## A table

| Feature | Where | Notes |
| --- | --- | --- |
| Styles | Toolbar | Headings make the outline |
| Page setup | File | Margins, size, orientation |
| Equations | Insert | Open the equations document beside this one |

> Anything you notice, say so: this build is here so you can steer early.
`,
  'Quarterly report draft.md': `# Quarterly report

## Summary

Revenue grew steadily through the quarter while costs held flat. The team shipped three of the four planned features, and the fourth moved to next quarter after research showed a simpler design.

## Highlights

1. The new onboarding cut setup time from twelve minutes to four.
2. Support requests fell by a fifth after the help pages were rewritten.
3. Two partners signed on for the pilot.

## Risks

- Hiring for the platform team is behind plan.
- One supplier has not confirmed prices for next year.

## Next quarter

Finish the deferred feature, close the hiring gap and agree prices with the supplier before the budget review.
`,
};

/** The first time only: a demo library with a few documents. Later refreshes keep whatever the owner changed. */
function seed(paths, env) {
  if (existsSync(paths.library)) return false;
  mkdirSync(paths.seed, { recursive: true });
  const cli = join(paths.app, 'out', 'main', 'cli.mjs');
  const run = (...args) => execFileSync(process.execPath, [cli, ...args], { env, cwd: paths.data, encoding: 'utf8' });
  run('setup', '--offline');
  const files = Object.entries(DEMO).map(([name, text]) => {
    writeFileSync(join(paths.seed, name), text);
    return join(paths.seed, name);
  });
  const equations = join(paths.worktree, 'docs', 'product', 'try-it', 'equations.docx');
  if (existsSync(equations)) {
    copyFileSync(equations, join(paths.seed, 'Equations.docx'));
    files.push(join(paths.seed, 'Equations.docx'));
  }
  for (const f of files) run('import', f);
  return true;
}

const readState = (paths) => {
  try {
    return JSON.parse(readFileSync(paths.state, 'utf8'));
  } catch {
    return null;
  }
};

const ps = (script) => spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).stdout?.trim() ?? '';

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The title of the process's main window, once it has one. */
const windowTitle = (pid) => (process.platform === 'win32' ? ps(`(Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue).MainWindowTitle`) : alive(pid) ? 'P-Doc' : '');

/** Whether the review build's window is the one in front: the owner is using it. */
function inFront(pid) {
  if (process.platform !== 'win32' || !alive(pid)) return false;
  const out = ps(`Add-Type -Namespace RB -Name W -MemberDefinition '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint p);'; $p = 0; [void][RB.W]::GetWindowThreadProcessId([RB.W]::GetForegroundWindow(), [ref]$p); $p`);
  return Number(out) === Number(pid);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function stop(paths) {
  const s = readState(paths);
  if (!s || !alive(s.pid)) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(s.pid)], { stdio: 'ignore' });
  else process.kill(s.pid, 'SIGTERM');
  for (let i = 0; i < 40 && alive(s.pid); i++) await sleep(250);
  if (alive(s.pid)) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/F', '/T', '/PID', String(s.pid)], { stdio: 'ignore' });
    else process.kill(s.pid, 'SIGKILL');
  }
}

async function start(paths) {
  const s = readState(paths);
  if (s && alive(s.pid) && windowTitle(s.pid)) return s;
  if (!existsSync(join(paths.app, 'out', 'main', 'main.mjs'))) throw new Error('Nothing built yet: run refresh first.');
  mkdirSync(paths.data, { recursive: true });
  if (!existsSync(paths.gitConfig)) writeFileSync(paths.gitConfig, '');
  const env = reviewEnv(paths);
  const seeded = seed(paths, env);
  const electron = createRequire(join(paths.app, 'package.json'))('electron');
  const child = spawn(electron, [paths.app], { cwd: paths.app, env, detached: true, stdio: 'ignore' });
  child.unref();
  const commit = git(paths.worktree, 'rev-parse', '--short', 'HEAD');
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    if (!alive(child.pid)) throw new Error('The review build closed as it started.');
    if (windowTitle(child.pid)) break;
  }
  if (!windowTitle(child.pid)) throw new Error('The review build started but showed no window within 30 seconds.');
  const state = { pid: child.pid, commit, started: new Date().toISOString(), seeded };
  writeFileSync(paths.state, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

async function refresh(paths, commit, force) {
  const target = git(REPO, 'rev-parse', '--verify', `${commit}^{commit}`);
  if (!existsSync(paths.worktree)) git(REPO, 'worktree', 'add', '--detach', paths.worktree, target);
  else git(paths.worktree, 'checkout', '--detach', '--force', target);
  const short = git(paths.worktree, 'rev-parse', '--short', 'HEAD');
  const sh = { cwd: paths.worktree, stdio: 'inherit', shell: true };
  if (spawnSync('pnpm install --frozen-lockfile', sh).status !== 0) throw new Error('pnpm install failed in the review worktree.');
  if (spawnSync('pnpm build', sh).status !== 0) throw new Error(`The build of ${short} failed; the running review build is unchanged.`);
  const s = readState(paths);
  if (s && alive(s.pid)) {
    if (s.commit === short && windowTitle(s.pid)) return { ...s, note: 'already at this commit' };
    if (inFront(s.pid) && !force) return { ...s, note: `built ${short}, but the owner is using the review build: not restarted (run start after stop, or refresh --force once they agree)` };
    await stop(paths);
  }
  return start(paths);
}

function describe(paths, s) {
  const on = s && alive(s.pid) && windowTitle(s.pid);
  return [
    on ? `Review build running: commit ${s.commit}, process ${s.pid}, window "${windowTitle(s.pid)}" (started ${s.started}).` : 'Review build not running.',
    `Worktree: ${paths.worktree}`,
    `Data (demo library and settings): ${paths.data}`,
    'Open: switch to the P-Doc window on the taskbar; if it was closed, run node tools/review-build.mjs start',
    s?.note ? `Note: ${s.note}` : '',
  ].filter(Boolean).join('\n');
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  const paths = reviewPaths();
  const force = rest.includes('--force');
  const commit = rest.find((a) => !a.startsWith('--')) ?? 'main';
  if (cmd === 'refresh') console.log(describe(paths, await refresh(paths, commit, force)));
  else if (cmd === 'start') console.log(describe(paths, await start(paths)));
  else if (cmd === 'stop') {
    await stop(paths);
    console.log('Review build closed.');
  } else if (cmd === 'status') console.log(describe(paths, readState(paths)));
  else {
    console.error('Usage: node tools/review-build.mjs refresh [<commit>] [--force] | start | stop | status');
    return 2;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(e.message);
      process.exitCode = 1;
    },
  );
}
