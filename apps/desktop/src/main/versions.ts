/**
 * When documents get a version (spec §4.6, U27): after a pause in writing, at least every so often
 * while writing goes on, and at once when the person switches documents or closes P-Doc. Saving
 * (every keystroke, shortly after) is separate: it only writes the file.
 */
import { VersionCadence } from "@p-doc/core";
import type { DocRef } from "../shared/api.ts";

export interface VersionsOptions {
  /** Makes a version of the document's saved state; null when nothing changed. */
  commit: (ref: DocRef) => Promise<string | null>;
  committed?: (ref: DocRef, sha: string) => void;
  failed?: (ref: DocRef, error: unknown) => void;
  pauseMs?: number;
  maxMs?: number;
  now?: () => number;
}

interface Pending {
  ref: DocRef;
  cadence: VersionCadence;
  timer: ReturnType<typeof setTimeout> | null;
}

const key = (ref: DocRef) => `${ref.space}:${ref.path}`;

export class Versions {
  private pending = new Map<string, Pending>();

  constructor(private readonly o: VersionsOptions) {}

  private now(): number {
    return (this.o.now ?? Date.now)();
  }

  /** Documents with saved changes that aren't a version yet. */
  get waiting(): DocRef[] {
    return [...this.pending.values()].map((p) => p.ref);
  }

  /** A document was saved. */
  changed(ref: DocRef): void {
    const k = key(ref);
    let p = this.pending.get(k);
    if (!p) this.pending.set(k, (p = { ref: { space: ref.space, path: ref.path }, cadence: new VersionCadence({ pauseMs: this.o.pauseMs, maxMs: this.o.maxMs }), timer: null }));
    p.cadence.change(this.now());
    this.arm(k, p);
  }

  private arm(k: string, p: Pending): void {
    if (p.timer) clearTimeout(p.timer);
    p.timer = null;
    const wait = p.cadence.wait(this.now());
    if (wait === Infinity) return;
    p.timer = setTimeout(() => {
      p.timer = null;
      if (this.pending.get(k) !== p) return;
      if (p.cadence.due(this.now())) void this.run(p.ref);
      else this.arm(k, p);
    }, wait);
  }

  /** Makes a version of the document now, whether or not one is due. */
  async commitNow(ref: DocRef): Promise<string | null> {
    return this.run(ref);
  }

  /** Makes a version now only if the document has saved changes waiting (opening its history). */
  async commitIfWaiting(ref: DocRef): Promise<string | null> {
    return this.pending.has(key(ref)) ? this.run(ref) : null;
  }

  private async run(ref: DocRef): Promise<string | null> {
    this.drop(ref);
    try {
      const sha = await this.o.commit(ref);
      if (sha) this.o.committed?.(ref, sha);
      return sha;
    } catch (e) {
      this.o.failed?.(ref, e);
      return null;
    }
  }

  /** Versions every waiting document but one (the person switched to it). */
  async commitExcept(ref: DocRef | null): Promise<void> {
    const skip = ref ? key(ref) : null;
    await Promise.all(this.waiting.filter((r) => key(r) !== skip).map((r) => this.run(r)));
  }

  /** Versions every waiting document (closing P-Doc). */
  commitAll(): Promise<void> {
    return this.commitExcept(null);
  }

  /** Forgets a document's waiting changes (it moved, or its versions were made another way). */
  drop(ref: DocRef): void {
    const p = this.pending.get(key(ref));
    if (p?.timer) clearTimeout(p.timer);
    this.pending.delete(key(ref));
  }
}
