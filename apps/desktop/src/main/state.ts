/** App state in the data folder, never in the repositories: settings and recovery copies. */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { userInfo } from "node:os";
import { parseDocument, serializeDocument, type PDocFile } from "@p-doc/core";
import { writeAtomic } from "./library.ts";
import { isDocRef, type DocRef, type Recovered, type Settings } from "../shared/api.ts";

export function defaultSettings(): Settings {
  let name = "Me";
  try {
    name = userInfo().username || name;
  } catch {
    // No user name on this system.
  }
  return { version: 1, firstRun: "pending", theme: "system", zoom: 100, identity: { name, email: "" }, spelling: true, leftPanel: "outline", compact: false, pageDefault: null, last: null };
}

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
    this.value = { ...d, ...read, version: 1, identity: { ...d.identity, ...(read.identity ?? {}) } };
  }

  get(): Settings {
    return structuredClone(this.value);
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
    if (patch.pageDefault === null || (patch.pageDefault && typeof patch.pageDefault === "object")) next.pageDefault = patch.pageDefault;
    if (patch.last === null || isDocRef(patch.last)) next.last = patch.last;
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
