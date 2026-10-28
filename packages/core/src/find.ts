/** Find and replace over text (U10): match case, whole words and regular expressions. */

export interface FindOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

export interface Match {
  from: number;
  to: number;
  /** Capture groups, for `$1` in a regular-expression replacement. */
  groups: string[];
}

export interface FindResult {
  matches: Match[];
  error: string | null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A global regular expression for a query, or an error message. */
export function compile(query: string, o: FindOptions = {}): RegExp | string {
  if (!query) return "Type something to find.";
  let source = o.regex ? query : escape(query);
  if (o.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  try {
    return new RegExp(source, `gu${o.matchCase ? "" : "i"}`);
  } catch (e) {
    return `That pattern isn't valid: ${(e as Error).message.replace(/^Invalid regular expression: /, "")}`;
  }
}

export function findInText(text: string, query: string, o: FindOptions = {}): FindResult {
  const re = compile(query, o);
  if (typeof re === "string") return { matches: [], error: query ? re : null };
  const matches: Match[] = [];
  for (const m of text.matchAll(re)) {
    if (m[0].length === 0) continue;
    matches.push({ from: m.index!, to: m.index! + m[0].length, groups: m.slice(1).map((g) => g ?? "") });
    if (matches.length >= 10_000) break;
  }
  return { matches, error: null };
}

/** The text that replaces a match: `$1`, `$&` and `$$` work when using regular expressions. */
export function replacementFor(match: Match, matched: string, replacement: string, o: FindOptions = {}): string {
  if (!o.regex) return replacement;
  return replacement.replace(/\$(\$|&|\d{1,2})/g, (_, g: string) => (g === "$" ? "$" : g === "&" ? matched : (match.groups[Number(g) - 1] ?? "")));
}

/** Replaces every match in a string (used by tests and the CLI). */
export function replaceAll(text: string, query: string, replacement: string, o: FindOptions = {}): { text: string; count: number } {
  const { matches } = findInText(text, query, o);
  let out = "";
  let last = 0;
  for (const m of matches) {
    out += text.slice(last, m.from) + replacementFor(m, text.slice(m.from, m.to), replacement, o);
    last = m.to;
  }
  return { text: out + text.slice(last), count: matches.length };
}
