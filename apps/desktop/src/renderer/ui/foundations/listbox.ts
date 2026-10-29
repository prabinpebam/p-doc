/**
 * The keyboard model shared by the Select and ListBox fundamentals: moving through options (skipping
 * disabled ones, stopping at the ends like a native list) and type-ahead. Pure, so it is unit-tested.
 * @tier 0
 */

export interface ListOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** The heading of the group the option sits under, if any. */
  group?: string;
}

/** The next enabled option from `from` in direction `dir` (`by` steps for Page Up/Down), or `from` when there is none. */
export function step(options: readonly ListOption[], from: number, dir: 1 | -1, by = 1): number {
  let at = from;
  let moved = 0;
  for (let i = from + dir; i >= 0 && i < options.length; i += dir) {
    if (options[i]!.disabled) continue;
    at = i;
    if (++moved >= by) break;
  }
  return at;
}

/** The first or last enabled option, or -1 when every option is disabled. */
export function edge(options: readonly ListOption[], which: "first" | "last"): number {
  if (which === "first") return options.findIndex((o) => !o.disabled);
  for (let i = options.length - 1; i >= 0; i--) if (!options[i]!.disabled) return i;
  return -1;
}

/**
 * Type-ahead: the option whose label starts with what was typed. Typing the same letter again cycles
 * through the options starting with it; otherwise the search starts at the current option.
 */
export function typeahead(options: readonly ListOption[], from: number, typed: string): number {
  const q = typed.toLocaleLowerCase();
  if (!q) return from;
  const same = [...q].every((c) => c === q[0]);
  const needle = same ? q[0]! : q;
  const start = same ? from + 1 : Math.max(from, 0);
  for (let k = 0; k < options.length; k++) {
    const i = (((start + k) % options.length) + options.length) % options.length;
    const o = options[i]!;
    if (!o.disabled && o.label.toLocaleLowerCase().startsWith(needle)) return i;
  }
  return from;
}

/** Where a popup list goes: below its control, or above when there is more room there. */
export function placeList(anchor: { top: number; bottom: number }, listHeight: number, viewport: number, gap: number): { top: number; maxHeight: number } {
  const below = viewport - anchor.bottom - gap * 2;
  const above = anchor.top - gap * 2;
  if (listHeight <= below || below >= above) return { top: anchor.bottom + gap, maxHeight: Math.max(below, 0) };
  return { top: anchor.top - gap - Math.min(listHeight, above), maxHeight: above };
}
