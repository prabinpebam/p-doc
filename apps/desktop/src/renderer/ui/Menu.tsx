/** An accessible menu: arrow keys, Home/End, submenus with Right/Left, Esc to close, check items. */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { ChevronRight16Regular, Checkmark16Regular } from "@fluentui/react-icons";

export interface MenuItemSpec {
  key: string;
  label: string;
  hint?: string;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  run?: () => void;
  items?: MenuItemSpec[];
}

export interface MenuListProps {
  items: MenuItemSpec[];
  label: string;
  /** Close everything; `restore` says whether focus goes back to where it was. */
  onClose: (restore: boolean) => void;
  /** Left/Right at the top level (the menu bar moves to the neighbouring menu). */
  onSide?: (dir: -1 | 1) => void;
  /** For a submenu: Left closes only it. */
  onBack?: () => void;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

const focusable = (items: MenuItemSpec[]) => items.map((it, i) => (it.separator || it.disabled ? -1 : i)).filter((i) => i >= 0);

export function MenuList({ items, label, onClose, onSide, onBack, className, style, id }: MenuListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() => focusable(items)[0] ?? -1);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.focus();
  }, [active]);

  const move = (dir: 1 | -1 | "home" | "end") => {
    const f = focusable(items);
    if (!f.length) return;
    if (dir === "home") return setActive(f[0]!);
    if (dir === "end") return setActive(f[f.length - 1]!);
    const at = f.indexOf(active);
    setActive(f[(at + dir + f.length) % f.length]!);
  };

  const activate = (i: number) => {
    const it = items[i];
    if (!it || it.disabled || it.separator) return;
    if (it.items) {
      setActive(i);
      setOpen(i);
      return;
    }
    onClose(true);
    it.run?.();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (open != null) return;
    const it = items[active];
    switch (e.key) {
      case "ArrowDown":
        move(1);
        break;
      case "ArrowUp":
        move(-1);
        break;
      case "Home":
        move("home");
        break;
      case "End":
        move("end");
        break;
      case "Enter":
      case " ":
        activate(active);
        break;
      case "ArrowRight":
        if (it?.items) setOpen(active);
        else if (onSide) onSide(1);
        else return;
        break;
      case "ArrowLeft":
        if (onBack) onBack();
        else if (onSide) onSide(-1);
        else return;
        break;
      case "Escape":
        if (onBack) onBack();
        else onClose(true);
        break;
      case "Tab":
        onClose(false);
        return;
      default: {
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey) {
          const f = focusable(items);
          const start = f.indexOf(active);
          const next = [...f.slice(start + 1), ...f.slice(0, start + 1)].find((i) => items[i]!.label.toLowerCase().startsWith(e.key.toLowerCase()));
          if (next != null) setActive(next);
          break;
        }
        return;
      }
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div ref={ref} role="menu" aria-label={label} className={`menu ${className ?? ""}`} style={style} id={id} onKeyDown={onKeyDown}>
      {items.map((it, i) =>
        it.separator ? (
          <div key={it.key} role="separator" className="menu-sep" />
        ) : (
          <div key={it.key} className="menu-slot">
            <div
              role={it.checked != null ? "menuitemcheckbox" : "menuitem"}
              aria-checked={it.checked != null ? it.checked : undefined}
              aria-disabled={it.disabled || undefined}
              aria-haspopup={it.items ? "menu" : undefined}
              aria-expanded={it.items ? open === i : undefined}
              tabIndex={i === active ? 0 : -1}
              data-index={i}
              className={`menu-item${it.danger ? " danger" : ""}`}
              onClick={() => activate(i)}
              onPointerEnter={() => {
                if (it.disabled) return;
                setActive(i);
                setOpen(it.items ? i : null);
              }}
            >
              <span className="menu-check" aria-hidden>
                {it.checked ? <Checkmark16Regular /> : null}
              </span>
              <span className="menu-label">{it.label}</span>
              {it.hint ? <span className="menu-hint">{it.hint}</span> : null}
              {it.items ? <ChevronRight16Regular className="menu-chevron" aria-hidden /> : null}
            </div>
            {it.items && open === i ? (
              <MenuList
                items={it.items}
                label={it.label}
                className="sub"
                onClose={onClose}
                onBack={() => {
                  setOpen(null);
                  ref.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.focus();
                }}
              />
            ) : null}
          </div>
        ),
      )}
    </div>
  );
}

/** Closes a floating element on a pointer press outside it. */
export function useOutside(ref: RefObject<HTMLElement | null>, on: boolean, close: () => void): void {
  useEffect(() => {
    if (!on) return;
    const fn = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", fn, true);
    return () => document.removeEventListener("pointerdown", fn, true);
  }, [on, close, ref]);
}
