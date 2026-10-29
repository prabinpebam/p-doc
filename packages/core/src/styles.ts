/** CSS for a document's paragraph styles, shared by the editor, print and HTML export. */
import { defaultStyles, SANS, STYLE_KEYS, STYLE_LABELS, type BuiltinStyleKey, type StyleDef, type Styles, type StyleKey } from "./format.ts";
import { listCss } from "./lists.ts";

const SELECTORS: Record<BuiltinStyleKey, string> = {
  normal: "p",
  title: "p.pd-style-title",
  subtitle: "p.pd-style-subtitle",
  heading1: "h1",
  heading2: "h2",
  heading3: "h3",
  heading4: "h4",
  heading5: "h5",
  heading6: "h6",
  quote: "blockquote > p",
  code: "pre",
};

function decl(s: StyleDef, isNormal: boolean): string {
  const out = [
    `font-family: ${s.fontFamily}`,
    `font-size: ${s.fontSize}pt`,
    `font-weight: ${s.bold ? 700 : 400}`,
    `font-style: ${s.italic ? "italic" : "normal"}`,
    `line-height: ${s.lineHeight}`,
    // Space before is padding so it adds to the space after the block above instead of collapsing into it (as in Word).
    // A paragraph's own space before sets --pd-sb; a bordered one takes it as a margin outside the border.
    `--pd-sb: ${s.spaceBefore}pt`,
    "padding-top: var(--pd-sb)",
    `margin: 0 0 ${s.spaceAfter}pt 0`,
    `font-variant-caps: ${s.smallCaps ? "small-caps" : "normal"}`,
  ];
  if (s.indent) out.push(`margin-inline-start: ${s.indent * 0.5}in`);
  if (s.color) out.push(`color: ${s.color}`);
  else if (!isNormal) out.push("color: inherit");
  return out.join("; ");
}

/** Style rules scoped under a selector (the page). */
export function styleCss(styles: Styles, scope: string): string {
  const n = styles.normal;
  const rules = [`${scope} { font-family: ${n.fontFamily}; font-size: ${n.fontSize}pt; line-height: ${n.lineHeight}; ${n.color ? `color: ${n.color};` : ""} }`];
  for (const k of STYLE_KEYS) rules.push(`${scope} ${SELECTORS[k]} { ${decl(styles[k], k === "normal")} }`);
  for (const k of customStyleKeys(styles)) rules.push(`${scope} p[data-style="${k}"] { ${decl(styles[k], false)} }`);
  rules.push(`${scope} pre code { font: inherit; color: inherit; font-variant-caps: inherit }`);
  rules.push(`${scope} li > p { margin: 0; padding-top: 0 }`);
  rules.push(listCss(scope));
  rules.push(`${scope} td > p, ${scope} th > p { margin: 0; padding-top: 0 }`);
  // Note text is smaller than body text (Word's Footnote Text is 10pt beside 11pt Normal).
  rules.push(`${scope} .pd-note > p { font-size: ${Math.round(n.fontSize * 8) / 10}pt; margin: 0; padding-top: 0 }`);
  return rules.join("\n");
}

/** The style a text block has, by its node type and attributes. */
export function styleKeyOf(type: string, attrs: Record<string, unknown>): StyleKey | null {
  if (type === "heading") {
    const level = Number(attrs.level ?? 1);
    return Number.isInteger(level) && level >= 1 && level <= 6 ? `heading${level}` as StyleKey : null;
  }
  if (type === "paragraph") return isStyleKey(attrs.textStyle) ? attrs.textStyle : "normal";
  if (type === "blockquote") return "quote";
  if (type === "codeBlock") return "code";
  return null;
}

export function isStyleKey(v: unknown): v is StyleKey {
  return typeof v === "string" && ((STYLE_KEYS as readonly string[]).includes(v) || /^custom-[a-z0-9-]+$/.test(v));
}

export const customStyleKeys = (styles: Styles): StyleKey[] => Object.keys(styles).filter((k): k is StyleKey => /^custom-[a-z0-9-]+$/.test(k));
export const styleKeys = (styles: Styles): StyleKey[] => [...STYLE_KEYS, ...customStyleKeys(styles)];
export const styleLabel = (key: StyleKey, styles: Styles): string => key.startsWith("custom-") ? styles[key]?.name ?? key : STYLE_LABELS[key as BuiltinStyleKey];
export const followingStyle = (key: StyleKey, styles: Styles): StyleKey => {
  const next = styles[key]?.next;
  return next && styles[next] ? next : key === "normal" || key.startsWith("custom-") ? key : "normal";
};

/** Settings and dialog input: keep unknown fields, but never let raw values become executable CSS. */
export function cleanStyles(raw: unknown): Styles {
  const out = defaultStyles();
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!isStyleKey(key) || !value || typeof value !== "object") continue;
    const r = value as Record<string, unknown>;
    const base = out[key] ?? out.normal;
    const number = (k: keyof StyleDef, min: number, max: number, fallback: number) => typeof r[k] === "number" && Number.isFinite(r[k]) && r[k] >= min && r[k] <= max ? r[k] : fallback;
    const { indent: _i, next: _n, smallCaps: _s, name: _m, ...rest } = r;
    const def: StyleDef = {
      ...rest,
      fontFamily: typeof r.fontFamily === "string" && /^[\w\s,'"-]{1,200}$/.test(r.fontFamily) ? r.fontFamily : base.fontFamily,
      fontSize: number("fontSize", 1, 400, base.fontSize),
      bold: typeof r.bold === "boolean" ? r.bold : base.bold,
      italic: typeof r.italic === "boolean" ? r.italic : base.italic,
      color: typeof r.color === "string" && /^(#[0-9a-f]{6})?$/i.test(r.color) ? r.color : base.color,
      lineHeight: number("lineHeight", 0.5, 10, base.lineHeight),
      spaceBefore: number("spaceBefore", 0, 400, base.spaceBefore),
      spaceAfter: number("spaceAfter", 0, 400, base.spaceAfter),
    };
    // Optional fields only when given, so an older file's styles read back exactly as they were.
    if (r.indent !== undefined) def.indent = number("indent", 0, 8, 0);
    if (isStyleKey(r.next)) def.next = r.next;
    if (typeof r.smallCaps === "boolean") def.smallCaps = r.smallCaps;
    if (typeof r.name === "string" && r.name.trim()) def.name = r.name.trim().slice(0, 100);
    else if (key.startsWith("custom-")) def.name = key.slice(7);
    out[key] = def;
  }
  return out;
}

export const STYLE_SETS = ["Default", "Classic", "Modern", "Compact"] as const;
export type StyleSet = (typeof STYLE_SETS)[number];

/** A set changes built-ins; personal styles remain the person's own. */
export function stylesForSet(set: StyleSet, current: Styles): Styles {
  const builtins = defaultStyles();
  if (set !== "Default") for (const key of STYLE_KEYS) {
    const s = builtins[key];
    if (key !== "code") s.fontFamily = set === "Classic" ? "'Times New Roman', Times, serif" : SANS;
    if (set === "Classic" && key.startsWith("heading")) s.smallCaps = true;
    if (set === "Modern" && key.startsWith("heading")) s.color = "#174ea6";
    if (set === "Compact") { s.lineHeight = 1; s.spaceBefore /= 2; s.spaceAfter /= 2; }
  }
  return { ...current, ...builtins };
}

export function wordStyleId(key: StyleKey): string {
  if (key === "normal") return "Normal";
  if (key.startsWith("heading")) return `Heading${key.slice(7)}`;
  if (key === "title") return "Title";
  if (key === "subtitle") return "Subtitle";
  if (key === "quote") return "Quote";
  if (key === "code") return "Code";
  return `PD${key}`;
}
