/** Version history rows grouped by day: Today, Yesterday, then dates (U28). */

export interface VersionInfo {
  sha: string;
  time: string;
  author: string;
  message: string;
  /** The version's name, when named (U31). */
  name?: string | null;
}

export interface VersionGroup<V extends VersionInfo = VersionInfo> {
  label: string;
  versions: V[];
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function groupVersions<V extends VersionInfo>(versions: V[], now = new Date(), locale = "en-US", onlyNamed = false): VersionGroup<V>[] {
  const today = dayKey(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday = dayKey(y);
  const groups = new Map<string, VersionGroup<V>>();
  const sorted = [...versions].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  for (const v of sorted) {
    if (onlyNamed && !v.name) continue;
    const d = new Date(v.time);
    const k = dayKey(d);
    const label = k === today ? "Today" : k === yesterday ? "Yesterday" : d.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { label, versions: [] }));
    g.versions.push(v);
  }
  return [...groups.values()];
}
