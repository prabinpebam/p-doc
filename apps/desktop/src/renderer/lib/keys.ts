/** Keyboard chords as strings ("Ctrl+Shift+L"), independent of keyboard layout for letters and digits. */

const CODES: Record<string, string> = {
  Slash: "/",
  Period: ".",
  Comma: ",",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Equal: "=",
  Minus: "-",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  NumpadAdd: "=",
  NumpadSubtract: "-",
};

/** The chord a key event makes, or null for a lone modifier. */
export function chordOf(e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): string | null {
  if (["Control", "Shift", "Alt", "Meta", "AltGraph"].includes(e.key)) return null;
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (CODES[e.code]) key = CODES[e.code]!;
  else key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const mods = [e.ctrlKey || e.metaKey ? "Ctrl" : "", e.altKey ? "Alt" : "", e.shiftKey ? "Shift" : ""].filter(Boolean);
  return [...mods, key].join("+");
}
