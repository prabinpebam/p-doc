/**
 * The `pdoc` command line (U38): the agent path into the same library the app uses. Electron-free:
 * it shares the library, settings and file converters with the main process. With `--json` every
 * command prints exactly one JSON value on stdout, errors included.
 *
 * Exit codes: 0 done · 1 usage · 2 no such document · 3 a person must act (`{"needs": ...}`) · 4 failed.
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { Library, localTime } from "../main/library.ts";
import { SettingsStore } from "../main/state.ts";
import { EXPORTS, exportBytes, importInto, isExportKind, MAX_IMPORT, ImportError } from "../main/files.ts";
import type { DocSummary, Space } from "../shared/api.ts";

export const EXIT = { ok: 0, usage: 1, notFound: 2, needsPerson: 3, failed: 4 } as const;

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  env: NodeJS.ProcessEnv;
  cwd: string;
  /** The app's version, for `pdoc --version`. */
  version?: string;
}

export const HELP = `pdoc: your P-Doc library from the command line.

Usage:
  pdoc setup --offline [--library <dir>]   Make the library without GitHub
  pdoc new "Title" [--public]              Make a document
  pdoc list [--bin]                        List documents, recently edited first
  pdoc history <doc>                       List a document's versions
  pdoc export <doc> --to docx|md|html|txt [--version <sha>] [--out <file>]
                                           Write a document as a file (text formats print when --out is left out)
  pdoc import <file>                       Make a private document from a .docx, .md, .html, .txt or .pdoc.json file

<doc> is a document's id (or its first 8 characters), its path, or its title.
Add --json to any command for one JSON value on stdout.

Exit codes: 0 done, 1 usage, 2 no such document, 3 a person must act, 4 failed.
`;

class CliError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

interface Args {
  positional: string[];
  flags: Map<string, string | true>;
}

const VALUED = new Set(["library", "to", "version", "out"]);
const BOOLEAN = new Set(["json", "offline", "public", "bin", "help"]);

function parse(argv: string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h") {
      flags.set("help", true);
      continue;
    }
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const name = a.slice(2, eq < 0 ? undefined : eq);
    if (BOOLEAN.has(name) && eq < 0) flags.set(name, true);
    else if (VALUED.has(name)) {
      const v = eq >= 0 ? a.slice(eq + 1) : argv[++i];
      if (v === undefined || v === "" || (eq < 0 && v.startsWith("--"))) throw new CliError(`--${name} needs a value.`, EXIT.usage);
      flags.set(name, v);
    } else throw new CliError(`Unknown option --${name}.`, EXIT.usage);
  }
  return { positional, flags };
}

/** Where the app keeps its settings: `PDOC_USER_DATA`, else the app's data folder. */
export function dataDir(env: NodeJS.ProcessEnv): string {
  if (env.PDOC_USER_DATA) return env.PDOC_USER_DATA;
  if (process.platform === "win32") return join(env.APPDATA || join(homedir(), "AppData", "Roaming"), "P-Doc");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "P-Doc");
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "P-Doc");
}

/** The library folder, chosen as the app chooses it (the app records its default in the settings). */
export function libraryRoot(env: NodeJS.ProcessEnv, settings: SettingsStore): string {
  return env.PDOC_LIBRARY || settings.get().library || join(homedir(), "Documents", "P-Doc");
}

/** Finds one document by id, path, id prefix or title, in that order. */
export function findDoc(lib: Library, key: string): DocSummary {
  const all = lib.list();
  const k = key.replace(/\\/g, "/").trim();
  const lower = k.toLowerCase();
  const tries: ((d: DocSummary) => boolean)[] = [
    (d) => d.id === k,
    (d) => d.path === k || `${d.space}/${d.path}` === k,
    (d) => k.length >= 4 && d.id.startsWith(k),
    (d) => d.title.toLowerCase() === lower,
  ];
  for (const t of tries) {
    const hits = all.filter(t);
    // A live document wins over a deleted one with the same title.
    const live = hits.filter((d) => !d.bin);
    const pick = live.length ? live : hits;
    if (pick.length === 1) return pick[0]!;
    if (pick.length > 1) throw new CliError(`More than one document matches "${key}". Use its id.`, EXIT.notFound, { matches: pick.map(brief) });
  }
  throw new CliError(`No document matches "${key}".`, EXIT.notFound);
}

const brief = (d: DocSummary) => ({ id: d.id, title: d.title, space: d.space, path: d.path, modified: d.modified, bin: d.bin });
const when = (iso: string) => localTime(iso);

export async function run(argv: string[], io: Io): Promise<number> {
  let json = argv.includes("--json");
  const print = (human: string, value: unknown) => io.out(json ? `${JSON.stringify(value, null, 2)}\n` : human.endsWith("\n") ? human : `${human}\n`);
  try {
    if (argv.filter((x) => x !== "--json").join(" ") === "--version") {
      print(io.version ?? "0.0.0", { version: io.version ?? "0.0.0" });
      return EXIT.ok;
    }
    const a = parse(argv);
    const [command, ...rest] = a.positional;
    if (a.flags.has("help") || command === "help" || !command) {
      print(HELP, { usage: HELP });
      return command || a.flags.has("help") ? EXIT.ok : EXIT.usage;
    }
    const settings = new SettingsStore(dataDir(io.env));
    const identity = () => {
      const id = settings.get().identity;
      return { name: id.name || "P-Doc", email: id.email || "p-doc@localhost" };
    };
    const open = () => Library.open(libraryRoot(io.env, settings), { identity });
    const one = (usage: string) => {
      const v = rest[0];
      if (!v || rest.length > 1) throw new CliError(`Usage: pdoc ${command} ${usage}`, EXIT.usage);
      return v;
    };

    switch (command) {
      case "setup": {
        if (!a.flags.has("offline")) throw new CliError("Connecting GitHub needs a person: open P-Doc and choose Connect GitHub, or run pdoc setup --offline.", EXIT.needsPerson, { needs: "sign-in" });
        const dir = a.flags.get("library");
        if (typeof dir === "string") {
          if (io.env.PDOC_LIBRARY) throw new CliError("PDOC_LIBRARY is set, so --library would be ignored.", EXIT.usage);
          settings.setLibrary(isAbsolute(dir) ? dir : resolve(io.cwd, dir));
        }
        const lib = await open();
        await lib.ensure();
        if (settings.get().firstRun !== "done") settings.set({ firstRun: "done" });
        print(`Library ready in ${lib.root}${lib.versioned ? "" : " (Git wasn't found, so there are no versions)"}`, { library: lib.root, private: lib.dir("private"), public: lib.dir("public"), versions: lib.versioned });
        return EXIT.ok;
      }
      case "new": {
        const title = one('"Title" [--public]');
        const space: Space = a.flags.has("public") ? "public" : "private";
        const lib = await open();
        await lib.ensure();
        const made = await lib.create({ title, space, page: settings.get().pageDefault ?? undefined });
        print(`Made ${made.summary.title} (${made.summary.id}) in ${space}`, { ...brief(made.summary), file: lib.file(made.summary) });
        return EXIT.ok;
      }
      case "list": {
        if (rest.length) throw new CliError("Usage: pdoc list [--bin]", EXIT.usage);
        const lib = await open();
        const docs = lib.list().filter((d) => a.flags.has("bin") || !d.bin);
        print(docs.map((d) => `${d.id.slice(0, 8)}  ${d.space.padEnd(7)}  ${when(d.modified)}  ${d.bin ? "(bin) " : ""}${d.title}`).join("\n") || "No documents yet.", docs.map(brief));
        return EXIT.ok;
      }
      case "history": {
        const lib = await open();
        const doc = findDoc(lib, one("<doc>"));
        if (!lib.versioned) throw new CliError("Git wasn't found, so there are no versions.", EXIT.failed);
        const versions = await lib.history(doc);
        print(versions.map((v) => `${v.sha.slice(0, 10)}  ${when(v.time)}  ${v.name ? `[${v.name}] ` : ""}${v.message}`).join("\n") || "No versions yet.", { document: brief(doc), versions });
        return EXIT.ok;
      }
      case "export": {
        const key = one("<doc> --to docx|md|html|txt [--version <sha>] [--out <file>]");
        const kind = a.flags.get("to");
        if (!isExportKind(kind)) throw new CliError("--to must be docx, md, html or txt.", EXIT.usage);
        const sha = a.flags.get("version");
        if (typeof sha === "string" && !/^[0-9a-f]{4,40}$/i.test(sha)) throw new CliError("--version must be a version's sha from pdoc history.", EXIT.usage);
        const out = a.flags.get("out");
        if (kind === "docx" && typeof out !== "string") throw new CliError("A Word document needs --out <file>.", EXIT.usage);
        const lib = await open();
        const found = findDoc(lib, key);
        let doc = lib.read(found).doc;
        let version: string | null = null;
        if (typeof sha === "string") {
          const v = lib.versioned ? (await lib.history(found)).find((e) => e.sha.startsWith(sha.toLowerCase())) : undefined;
          if (!v) throw new CliError(`This document has no version ${sha}.`, EXIT.notFound);
          doc = await lib.versionAt(found, v.sha);
          version = v.sha;
        }
        const bytes = await exportBytes(doc, kind);
        if (typeof out !== "string") {
          const text = new TextDecoder().decode(bytes);
          print(text, { document: brief(found), version, format: kind, content: text });
          return EXIT.ok;
        }
        const ext = `.${EXPORTS[kind].ext}`;
        const file = resolve(io.cwd, out.toLowerCase().endsWith(ext) ? out : `${out}${ext}`);
        writeFileSync(file, bytes);
        print(`Saved ${file}`, { document: brief(found), version, format: kind, file, bytes: bytes.byteLength });
        return EXIT.ok;
      }
      case "import": {
        const file = resolve(io.cwd, one("<file>"));
        let size: number;
        try {
          size = statSync(file).size;
        } catch {
          throw new CliError(`There's no file at ${file}.`, EXIT.notFound);
        }
        if (size > MAX_IMPORT) throw new CliError("This file is larger than 50 MB.", EXIT.failed);
        const lib = await open();
        const r = await importInto(lib, basename(file), new Uint8Array(readFileSync(file)), settings.get().pageDefault);
        const s = r.opened.summary;
        print(`Imported ${s.title} (${s.id})${r.leftOut.length ? `. Some parts (${r.leftOut.join(", ")}) were left out.` : ""}`, { ...brief(s), file: lib.file(s), leftOut: r.leftOut });
        return EXIT.ok;
      }
      default:
        throw new CliError(`Unknown command "${command}". Run pdoc help.`, EXIT.usage);
    }
  } catch (e) {
    const err = e instanceof CliError ? e : new CliError(e instanceof ImportError ? e.message : `Failed: ${(e as Error).message}`, EXIT.failed);
    if (json) io.out(`${JSON.stringify({ error: err.message, code: err.code, ...err.extra })}\n`);
    else io.err(`${err.message}\n`);
    return err.code;
  }
}
