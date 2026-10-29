/** List formats (U43): number formats and bullets per list, start numbers and nesting depth. */

export const NUMBER_FORMATS = ["decimal", "lower-alpha", "lower-roman", "upper-alpha", "upper-roman", "decimal-leading-zero"] as const;
export const BULLET_FORMATS = ["disc", "circle", "square", "dash", "check"] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];
export type BulletFormat = (typeof BULLET_FORMATS)[number];
export type ListFormat = NumberFormat | BulletFormat;
export type ListKind = "orderedList" | "bulletList";

/** Lists nest down to nine levels, as in Word. */
export const MAX_LIST_DEPTH = 9;

/** What a format shows, for menus and dialogs. */
export const LIST_FORMAT_LABELS: Record<ListFormat, string> = {
  decimal: "1, 2, 3",
  "lower-alpha": "a, b, c",
  "lower-roman": "i, ii, iii",
  "upper-alpha": "A, B, C",
  "upper-roman": "I, II, III",
  "decimal-leading-zero": "01, 02, 03",
  disc: "• Filled circle",
  circle: "◦ Hollow circle",
  square: "▪ Square",
  dash: "– Dash",
  check: "✓ Check",
};

const BULLET_CHAR: Record<BulletFormat, string> = { disc: "•", circle: "◦", square: "▪", dash: "–", check: "✓" };

export const isNumberFormat = (v: unknown): v is NumberFormat => (NUMBER_FORMATS as readonly unknown[]).includes(v);
export const isBulletFormat = (v: unknown): v is BulletFormat => (BULLET_FORMATS as readonly unknown[]).includes(v);

/** A format the list kind can have, or null (the level's default). */
export function cleanListFormat(kind: string, v: unknown): ListFormat | null {
  if (kind === "orderedList") return isNumberFormat(v) ? v : null;
  if (kind === "bulletList") return isBulletFormat(v) ? v : null;
  return null;
}

/** A start number: a whole number from 0 to 32767 (Word's limit), else 1. */
export function cleanStart(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 32767 ? n : 1;
}

/** The format a list has at a nesting level (0-based) when none is set: 1, a, i and •, ◦, ▪, repeating. */
export function defaultListFormat(kind: ListKind, level: number): ListFormat {
  const i = ((level % 3) + 3) % 3;
  return kind === "orderedList" ? (["decimal", "lower-alpha", "lower-roman"] as const)[i] : (["disc", "circle", "square"] as const)[i];
}

/** CSS `list-style-type` for a format. */
export function listStyleType(f: ListFormat): string {
  return isBulletFormat(f) ? (f === "dash" || f === "check" ? `"${BULLET_CHAR[f]}  "` : f) : f;
}

/** The default level cycle as page CSS, so the page, print and HTML number nested lists alike. */
export function listCss(scope: string): string {
  const rules: string[] = [];
  for (const kind of ["orderedList", "bulletList"] as const) {
    const tag = kind === "orderedList" ? "ol" : "ul:not([data-type])";
    for (let level = 0; level < 3; level++) {
      // Levels 1, 4, 7 / 2, 5, 8 / 3, 6, 9: each nested list one deeper than the last.
      const chain = (depth: number) => Array.from({ length: depth + 1 }, () => tag).join(" ");
      const sels = [level, level + 3, level + 6].map((d) => `${scope} ${chain(d)}`);
      rules.push(`${sels.join(", ")} { list-style-type: ${listStyleType(defaultListFormat(kind, level))} }`);
    }
  }
  return rules.join("\n");
}

function roman(n: number): string {
  if (n <= 0 || n >= 4000) return String(n);
  const table: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  for (const [v, s] of table) while (n >= v) (out += s), (n -= v);
  return out;
}

function alpha(n: number): string {
  if (n <= 0) return String(n);
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(97 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** The marker an item shows: "3.", "c.", "iii.", "03." or the bullet. */
export function listMarker(f: ListFormat, n: number): string {
  switch (f) {
    case "decimal": return `${n}.`;
    case "lower-alpha": return `${alpha(n)}.`;
    case "upper-alpha": return `${alpha(n).toUpperCase()}.`;
    case "lower-roman": return `${roman(n)}.`;
    case "upper-roman": return `${roman(n).toUpperCase()}.`;
    case "decimal-leading-zero": return `${n < 10 && n >= 0 ? "0" : ""}${n}.`;
    default: return BULLET_CHAR[f];
  }
}

/** Word's level format name (docx `LevelFormat`) and level text for a format at a level. */
export function wordLevel(f: ListFormat, level: number): { format: "decimal" | "lowerLetter" | "lowerRoman" | "upperLetter" | "upperRoman" | "decimalZero" | "bullet"; text: string } {
  const n = `%${level + 1}.`;
  switch (f) {
    case "decimal": return { format: "decimal", text: n };
    case "lower-alpha": return { format: "lowerLetter", text: n };
    case "lower-roman": return { format: "lowerRoman", text: n };
    case "upper-alpha": return { format: "upperLetter", text: n };
    case "upper-roman": return { format: "upperRoman", text: n };
    case "decimal-leading-zero": return { format: "decimalZero", text: n };
    default: return { format: "bullet", text: BULLET_CHAR[f] };
  }
}
