/** The menu bar (File … Help): a WAI-ARIA menubar over the command registry. */
import { useCallback, useEffect, useRef, useState } from "react";
import { COMMANDS, labelOf, MENUS, shownChord, type MenuEntry } from "../commands.ts";
import { app } from "../state.ts";
import { MenuList, useOutside, type MenuItemSpec } from "./Menu.tsx";

export function toSpecs(entries: MenuEntry[], prefix = ""): MenuItemSpec[] {
  return entries.map((e, i): MenuItemSpec => {
    if (e === "-") return { key: `${prefix}sep${i}`, label: "", separator: true };
    if (typeof e !== "string") return { key: `${prefix}${e.label}`, label: e.label, items: toSpecs(e.items, `${prefix}${e.label}/`) };
    const c = COMMANDS.get(e);
    if (!c) return { key: e, label: e, disabled: true };
    return { key: e, label: labelOf(c), hint: shownChord(c), checked: c.checked?.(), disabled: c.enabled ? !c.enabled() : false, run: c.run };
  });
}

export function MenuBar() {
  const [open, setOpen] = useState<number | null>(null);
  const [focus, setFocus] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLElement | null>(null);
  // Labels and checks follow the document.
  app.use((s) => s.tick);
  app.use((s) => s.settings);
  app.use((s) => s.current);
  app.use((s) => s.sync?.state.kind);

  const close = useCallback((restore: boolean) => {
    setOpen(null);
    if (restore && back.current?.isConnected) back.current.focus();
  }, []);
  useOutside(ref, open != null, () => close(false));

  const show = (i: number) => {
    if (open == null && !ref.current?.contains(document.activeElement)) back.current = document.activeElement as HTMLElement | null;
    setFocus(i);
    setOpen(i);
  };

  useEffect(() => {
    const fn = (e: Event) => {
      const i = MENUS.findIndex((m) => m.key === (e as CustomEvent<string>).detail);
      if (i >= 0) show(i);
    };
    window.addEventListener("pdoc:menu", fn);
    return () => window.removeEventListener("pdoc:menu", fn);
  });

  const top = (i: number) => ref.current?.querySelector<HTMLElement>(`[data-menu="${i}"]`);
  const side = (dir: -1 | 1) => {
    const n = ((open ?? focus) + dir + MENUS.length) % MENUS.length;
    if (open != null) show(n);
    else {
      setFocus(n);
      top(n)?.focus();
    }
  };

  return (
    <div ref={ref} role="menubar" aria-label="Menu" className="menubar" data-region>
      {MENUS.map((m, i) => (
        <div key={m.id} className="menubar-slot">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            tabIndex={i === focus ? 0 : -1}
            data-menu={i}
            className={`menubar-item${open === i ? " open" : ""}`}
            onClick={() => (open === i ? close(true) : show(i))}
            onPointerEnter={() => open != null && open !== i && show(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                side(e.key === "ArrowRight" ? 1 : -1);
              } else if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                show(i);
              } else if (e.key === "Escape") {
                close(true);
              }
            }}
          >
            {m.label}
          </button>
          {open === i ? <MenuList items={toSpecs(m.items)} label={m.label} className="dropdown" onClose={close} onSide={side} /> : null}
        </div>
      ))}
    </div>
  );
}
