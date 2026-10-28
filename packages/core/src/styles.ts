/** CSS for a document's paragraph styles, shared by the editor, print and HTML export. */
import type { StyleDef, Styles, StyleKey } from "./format.ts";

const SELECTORS: Record<StyleKey, string> = {
  normal: "p",
  title: "p.pd-style-title",
  subtitle: "p.pd-style-subtitle",
  heading1: "h1",
  heading2: "h2",
  heading3: "h3",
  heading4: "h4",
  heading5: "h5",
  heading6: "h6",
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
  ];
  if (s.color) out.push(`color: ${s.color}`);
  else if (!isNormal) out.push("color: inherit");
  return out.join("; ");
}

/** Style rules scoped under a selector (the page). */
export function styleCss(styles: Styles, scope: string): string {
  const n = styles.normal;
  const rules = [`${scope} { font-family: ${n.fontFamily}; font-size: ${n.fontSize}pt; line-height: ${n.lineHeight}; ${n.color ? `color: ${n.color};` : ""} }`];
  for (const k of Object.keys(SELECTORS) as StyleKey[]) rules.push(`${scope} ${SELECTORS[k]} { ${decl(styles[k], k === "normal")} }`);
  rules.push(`${scope} li > p { margin: 0; padding-top: 0 }`);
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
  if (type === "paragraph") return attrs.textStyle === "title" ? "title" : attrs.textStyle === "subtitle" ? "subtitle" : "normal";
  return null;
}
