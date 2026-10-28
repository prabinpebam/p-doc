/** App state in the data folder, never in the repositories: settings and recovery copies. */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { userInfo } from "node:os";
import { cleanPage, parseDocument, serializeDocument, type PDocFile } from "@p-doc/core";
import { writeAtomic, SPACES } from "./library.ts";
import { DEFAULT_REPOS, isDocRef, isRepoName, type DocRef, type FirstRunStep, type GitHubLink, type Recovered, type Settings } from "../shared/api.ts";

export function defaultSettings(): Settings {
  let name = "Me";
  try {
    name = userInfo().username || name;
  } catch {
    // No user name on this system.
  }
  return { version: 1, firstRun: "pending", firstRunStep: "welcome", theme: "system", zoom: 100, identity: { name, email: "" }, spelling: true, leftPanel: "outline", compact: false, ruler: false, marks: false, pageDefault: null, last: null, github: null, library: null };
}

const STEPS: FirstRunStep[] = ["welcome", "git", "signIn", "identity", "repos", "done"];

function cleanLink(l: unknown): GitHubLink | null {
  if (!l || typeof l !== "object") return null;
  const v = l as Partial<GitHubLink>;
  if (typeof v.login !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(v.login)) return null;
  const names = { ...DEFAULT_REPOS };
  for (const s of SPACES) if (isRepoName(v.names?.[s])) names[s] = v.names[s];
  return { login: v.login, names, connected: v.connected === true, auto: v.auto !== false };
}

const cleanLibrary = (v: unknown): string | null => (typeof v === "string" && isAbsolute(v) && v.length < 1000 ? v : null);

export class SettingsStore {
  private value: Settings;
  private readonly file: string;

  constructor(dataDir: string) {
    this.file = join(dataDir, "settings.json");
    const d = defaultSettings();
    let read: Partial<Settings> = {};
    try {
      if (existsSync(this.file)) read = JSON.parse(readFileSync(this.file, "utf8")) as Partial<Settings>;
    } catch {
      // A damaged settings file: start from the defaults.
    }
    this.value = { ...d, ...read, version: 1, identity: { ...d.identity, ...(read.identity ?? {}) }, github: cleanLink(read.github), firstRunStep: STEPS.includes(read.firstRunStep as FirstRunStep) ? read.firstRunStep! : "welcome", library: cleanLibrary(read.library) };
  }

  get(): Settings {
    return structuredClone(this.value);
  }

  /** The library folder (`pdoc setup --library`); the window can't change it. */
  setLibrary(dir: string | null): Settings {
    this.value = { ...this.value, library: cleanLibrary(dir) };
    writeAtomic(this.file, `${JSON.stringify(this.value, null, 2)}\n`);
    return this.get();
  }

  set(patch: Partial<Settings>): Settings {
    const next = { ...this.value };
    if (patch.firstRun === "pending" || patch.firstRun === "done") next.firstRun = patch.firstRun;
    if (patch.theme === "light" || patch.theme === "dark" || patch.theme === "system") next.theme = patch.theme;
    if (typeof patch.zoom === "number" && patch.zoom >= 25 && patch.zoom <= 300) next.zoom = Math.round(patch.zoom);
    if (patch.identity && typeof patch.identity.name === "string" && typeof patch.identity.email === "string") next.identity = { name: patch.identity.name.trim().slice(0, 200), email: patch.identity.email.trim().slice(0, 200) };
    if (typeof patch.spelling === "boolean") next.spelling = patch.spelling;
    if (patch.leftPanel === null || patch.leftPanel === "library" || patch.leftPanel === "outline") next.leftPanel = patch.leftPanel;
    if (typeof patch.compact === "boolean") next.compact = patch.compact;
    if (typeof patch.ruler === "boolean") next.ruler = patch.ruler;
    if (typeof patch.marks === "boolean") next.marks = patch.marks;
    if (patch.pageDefault === null || (patch.pageDefault && typeof patch.pageDefault === "object")) next.pageDefault = patch.pageDefault ? cleanPage(patch.pageDefault) : null;
    if (patch.last === null || isDocRef(patch.last)) next.last = patch.last;
    if (STEPS.includes(patch.firstRunStep as FirstRunStep)) next.firstRunStep = patch.firstRunStep!;
    if (patch.github === null) next.github = null;
    else if (patch.github !== undefined) next.github = cleanLink(patch.github) ?? next.github;
    this.value = next;
    writeAtomic(this.file, `${JSON.stringify(next, null, 2)}\n`);
    return this.get();
  }
}

/** Copies of unsaved text, kept while a document is dirty and removed once it's saved (P1). */
export class RecoveryStore {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, "recovery");
  }

  private fileOf(ref: DocRef): string {
    return join(this.dir, `${ref.space}__${ref.path.replace(/[/\\]/g, "__")}`);
  }

  put(ref: DocRef, doc: PDocFile): void {
    if (!isDocRef(ref)) return;
    mkdirSync(this.dir, { recursive: true });
    writeAtomic(this.fileOf(ref), JSON.stringify({ ref, doc: JSON.parse(serializeDocument(doc)) }));
  }

  clear(ref: DocRef): void {
    if (isDocRef(ref)) rmSync(this.fileOf(ref), { force: true });
  }

  take(): Recovered[] {
    if (!existsSync(this.dir)) return [];
    const out: Recovered[] = [];
    for (const name of readdirSync(this.dir)) {
      const file = join(this.dir, name);
      try {
        const raw = JSON.parse(readFileSync(file, "utf8")) as { ref: DocRef; doc: unknown };
        if (isDocRef(raw.ref)) out.push({ ref: raw.ref, doc: parseDocument(JSON.stringify(raw.doc)) });
      } catch {
        // Unreadable: nothing to recover from it.
      }
      rmSync(file, { force: true });
    }
    return out;
  }
}
