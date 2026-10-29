/**
 * ListBox: an always-visible list to pick one item from, where the list is the main thing on screen
 * (the styles in the Styles dialog). The selection follows the keyboard, as in a native list. Use a
 * Select when the choice can fold away.
 * @tier 1
 * @a11y APG listbox, single select, focus on the list with aria-activedescendant; named by `aria-label`.
 * @key ArrowDown, ArrowUp: next or previous item
 * @key Home, End, PageUp, PageDown: first, last, ten up or down
 * @key Letters: jump to the item starting with them
 */
import { useEffect, useId, useMemo, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { edge, step, typeahead } from "../foundations/listbox.ts";
import { optionsOf } from "../foundations/options.ts";

export interface ListBoxProps {
  /** The chosen item's value. */
  value: string;
  /** Called with the item a person moved to or clicked. */
  onValueChange: (value: string) => void;
  /** `<option value>` elements. */
  children: ReactNode;
  /** The accessible name of the list. */
  "aria-label": string;
  /** How many rows show before it scrolls (default 10). */
  rows?: number;
  disabled?: boolean;
  /** Data attributes pass through (`data-autofocus`). */
  [data: `data-${string}`]: string | boolean | undefined;
}

export function ListBox({ value, onValueChange, children, rows = 10, disabled, ...rest }: ListBoxProps) {
  const options = useMemo(() => optionsOf(children), [children]);
  const chosen = options.findIndex((o) => o.value === value);
  const ref = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const uid = useId();
  const optId = (i: number) => `${uid}-o${i}`;
  const data = Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith("data-")));

  useEffect(() => {
    if (chosen >= 0) ref.current?.querySelector(`#${CSS.escape(optId(chosen))}`)?.scrollIntoView({ block: "nearest" });
  }, [chosen]);

  const choose = (i: number) => {
    const o = options[i];
    if (o && !o.disabled && o.value !== value) onValueChange(o.value);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key;
    const from = chosen >= 0 ? chosen : -1;
    let to: number | null = null;
    if (k === "ArrowDown") to = from < 0 ? edge(options, "first") : step(options, from, 1);
    else if (k === "ArrowUp") to = from < 0 ? edge(options, "last") : step(options, from, -1);
    else if (k === "PageDown") to = step(options, from, 1, 10);
    else if (k === "PageUp") to = step(options, Math.max(from, 0), -1, 10);
    else if (k === "Home") to = edge(options, "first");
    else if (k === "End") to = edge(options, "last");
    else if (k.length === 1 && k !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      typed.current = { text: now - typed.current.at < 600 ? typed.current.text + k : k, at: now };
      to = typeahead(options, from, typed.current.text);
    }
    if (to == null) return;
    e.preventDefault();
    choose(to);
  };

  return (
    <div
      ref={ref}
      role="listbox"
      className="listbox"
      tabIndex={disabled ? -1 : 0}
      aria-label={rest["aria-label"]}
      aria-disabled={disabled || undefined}
      aria-activedescendant={chosen >= 0 ? optId(chosen) : undefined}
      data-value={value}
      style={{ "--listbox-rows": rows } as CSSProperties}
      onKeyDown={disabled ? undefined : onKeyDown}
      {...data}
    >
      {options.map((o, i) => (
        <div
          key={i}
          id={optId(i)}
          role="option"
          className="listbox-option"
          aria-selected={i === chosen}
          aria-disabled={o.disabled || undefined}
          data-value={o.value}
          onClick={() => !disabled && choose(i)}
        >
          {o.label}
        </div>
      ))}
    </div>
  );
}
