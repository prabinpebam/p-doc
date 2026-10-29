/**
 * Select: choose one value from a short list, in a form field or the toolbar. The app's own control
 * (not the browser's), so its list follows the tokens in every theme. A select-only combobox: focus
 * stays on the control and the list shows the active option. Use a ListBox when the list is always
 * shown, and a Menu for commands.
 * @tier 1
 * @a11y APG select-only combobox: role combobox with aria-expanded, aria-controls and
 *   aria-activedescendant; the list is a listbox of options with aria-selected. Its name comes from a
 *   wrapping `<label>` or `aria-label`.
 * @key ArrowDown, ArrowUp, Alt+ArrowDown, Enter, Space: open the list (closed); move (open)
 * @key Home, End, PageUp, PageDown: first, last, ten up or down
 * @key Enter, Space, Alt+ArrowUp: choose the active option and close
 * @key Tab: choose the active option and move on
 * @key Escape: close without changing
 * @key Letters: jump to the option starting with them
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Checkmark16Regular, ChevronDown16Regular } from "@fluentui/react-icons";
import { edge, placeList, step, typeahead } from "../foundations/listbox.ts";
import { optionsOf } from "../foundations/options.ts";

export interface SelectProps {
  /** The chosen value (a number matches as text); shows "—" when no option has it. */
  value: string | number;
  /** Called with the value a person chose (only when it changes). */
  onValueChange: (value: string) => void;
  /** `<option value>` elements, optionally inside `<optgroup label>`. */
  children: ReactNode;
  /** `field` in forms (default); `toolbar` flat, for the toolbar. */
  variant?: "field" | "toolbar";
  /** The width in the toolbar: `auto` (default), or the wider `style` and `font` pickers. */
  width?: "auto" | "style" | "font";
  /** Form name; tests and forms find the control by it. */
  name?: string;
  id?: string;
  "aria-label"?: string;
  title?: string;
  disabled?: boolean;
  /** Roving toolbars take the control out of the Tab order (-1). */
  tabIndex?: number;
  /** Data attributes pass through to the control (`data-tb`, `data-autofocus`). */
  [data: `data-${string}`]: string | boolean | undefined;
}

const GAP = 4;

export function Select({ value: raw, onValueChange, children, variant = "field", width = "auto", name, id, title, disabled, tabIndex, ...rest }: SelectProps) {
  const value = String(raw);
  const options = useMemo(() => optionsOf(children), [children]);
  const chosen = options.findIndex((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(chosen);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const uid = useId();
  const listId = `${uid}-list`;
  const controlId = id ?? `${uid}-control`;
  const optId = (i: number) => `${uid}-o${i}`;
  const data = Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith("data-") || k === "aria-label"));

  const choose = (i: number) => {
    const o = options[i];
    if (o && !o.disabled && o.value !== value) onValueChange(o.value);
  };
  const show = () => {
    if (disabled || !options.length) return;
    setActive(chosen >= 0 ? chosen : edge(options, "first"));
    setOpen(true);
  };
  const close = () => setOpen(false);

  // The list sits in the top layer (above dialogs), placed against the control.
  useLayoutEffect(() => {
    const l = list.current;
    const b = button.current;
    if (!l || !b) return;
    if (!open) {
      if (l.matches(":popover-open")) l.hidePopover();
      return;
    }
    if (!l.matches(":popover-open")) l.showPopover();
    const r = b.getBoundingClientRect();
    l.style.setProperty("--select-min-width", `${Math.round(r.width)}px`);
    // Kept inside the window: a wide list from a control near the right edge shifts left.
    l.style.setProperty("--select-left", `${Math.round(Math.max(GAP, Math.min(r.left, window.innerWidth - l.offsetWidth - GAP)))}px`);
    const p = placeList(r, l.scrollHeight, window.innerHeight, GAP);
    l.style.setProperty("--select-top", `${Math.round(p.top)}px`);
    l.style.setProperty("--select-max-height", `${Math.round(p.maxHeight)}px`);
  }, [open]);

  useEffect(() => {
    if (open && active >= 0) list.current?.querySelector(`#${CSS.escape(optId(active))}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !button.current?.contains(t)) close();
    };
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const k = e.key;
    let handled = true;
    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") show();
      else if (k === "Home") choose(edge(options, "first"));
      else if (k === "End") choose(edge(options, "last"));
      else handled = false;
    } else if (k === "Escape") close();
    else if (k === "Enter" || k === " " || (k === "ArrowUp" && e.altKey)) {
      choose(active);
      close();
    } else if (k === "Tab") {
      choose(active);
      close();
      handled = false;
    } else if (k === "ArrowDown") setActive((a) => step(options, a, 1));
    else if (k === "ArrowUp") setActive((a) => step(options, a, -1));
    else if (k === "PageDown") setActive((a) => step(options, a, 1, 10));
    else if (k === "PageUp") setActive((a) => step(options, a, -1, 10));
    else if (k === "Home") setActive(edge(options, "first"));
    else if (k === "End") setActive(edge(options, "last"));
    else handled = false;
    if (!handled && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && k !== " ") {
      const now = Date.now();
      typed.current = { text: now - typed.current.at < 600 ? typed.current.text + k : k, at: now };
      const at = typeahead(options, open ? active : chosen, typed.current.text);
      if (open) setActive(at);
      else choose(at);
      handled = true;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    // A click on the wrapping label only focuses the control, as it does a native select.
    if (e.detail === 0) return;
    if (open) close();
    else show();
  };

  let lastGroup: string | undefined;
  return (
    <>
      <button
        ref={button}
        type="button"
        role="combobox"
        className="select"
        data-variant={variant}
        data-width={width}
        data-value={value}
        name={name}
        id={controlId}
        title={title}
        disabled={disabled}
        tabIndex={tabIndex}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onBlur={close}
        {...data}
      >
        <span className="select-value">{chosen >= 0 ? options[chosen]!.label : "—"}</span>
        <ChevronDown16Regular className="select-chevron" aria-hidden="true" />
      </button>
      <div ref={list} id={listId} role="listbox" popover="manual" className="select-list"
        aria-labelledby={controlId}
        tabIndex={-1}
        // A drag on its scrollbar keeps the list open; a click on a heading doesn't reach the label.
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => e.preventDefault()}
      >
        {options.map((o, i) => {
          const head = o.group !== lastGroup && o.group ? (
            <div key={`g${i}`} className="select-group" role="presentation">
              {o.group}
            </div>
          ) : null;
          lastGroup = o.group;
          return [
            head,
            <div
              key={i}
              id={optId(i)}
              role="option"
              className="select-option"
              aria-selected={i === chosen}
              aria-disabled={o.disabled || undefined}
              data-value={o.value}
              data-active={(open && i === active) || undefined}
              onPointerMove={() => !o.disabled && i !== active && setActive(i)}
              // Keeps focus (and the open list) on the control; the label wrapping it isn't activated.
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                if (o.disabled) return;
                choose(i);
                close();
              }}
            >
              <Checkmark16Regular className="select-check" aria-hidden="true" />
              <span>{o.label}</span>
            </div>,
          ];
        })}
      </div>
    </>
  );
}
