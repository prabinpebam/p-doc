/**
 * When to make a version (commit): after a 60 s pause following a change, and at least every
 * 10 minutes while changes keep coming. Closing or switching documents commits at once (the caller).
 */

export interface CadenceOptions {
  pauseMs?: number;
  maxMs?: number;
}

export class VersionCadence {
  readonly pauseMs: number;
  readonly maxMs: number;
  private dirtySince: number | null = null;
  private lastChange = 0;

  constructor(o: CadenceOptions = {}) {
    this.pauseMs = o.pauseMs ?? 60_000;
    this.maxMs = o.maxMs ?? 600_000;
  }

  get dirty(): boolean {
    return this.dirtySince != null;
  }

  change(now: number): void {
    this.dirtySince ??= now;
    this.lastChange = now;
  }

  /** Whether a version is due now. */
  due(now: number): boolean {
    if (this.dirtySince == null) return false;
    return now - this.lastChange >= this.pauseMs || now - this.dirtySince >= this.maxMs;
  }

  /** Milliseconds until a version is due (Infinity when nothing changed). */
  wait(now: number): number {
    if (this.dirtySince == null) return Infinity;
    return Math.max(0, Math.min(this.lastChange + this.pauseMs, this.dirtySince + this.maxMs) - now);
  }

  committed(): void {
    this.dirtySince = null;
  }
}
