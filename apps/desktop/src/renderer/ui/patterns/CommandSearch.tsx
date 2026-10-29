/** Command search (V8, Alt+/): every command by name, with its menu path and shortcut. */
import { useMemo, useRef, useState } from "react";
import { COMMANDS, labelOf, MENU_PATH, runCommand, shownChord } from "../../commands.ts";
import { getEditor, focusEditor } from "../../session.ts";
import { app } from "../../state.ts";

export function CommandSearch() {
  const open = app.use((s) => s.palette);
  if (!open) return null;
  return <Palette />;
}

function Palette() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const back = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return [...COMMANDS.values()]
      .filter((c) => c.id !== "tools.search")
      .map((c) => ({ c, label: labelOf(c), path: MENU_PATH.get(c.id) ?? "" }))
      .filter(({ c, label, path }) => {
        const hay = `${label} ${path} ${c.keywords ?? ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => {
        const w = words[0] ?? "";
        const sa = a.label.toLowerCase().startsWith(w) ? 0 : 1;
        const sb = b.label.toLowerCase().startsWith(w) ? 0 : 1;
        return sa - sb;
      })
      .slice(0, 50);
  }, [q]);
  const at = Math.min(active, Math.max(0, results.length - 1));

  const close = (restore = true) => {
    app.set({ palette: false });
    if (restore && back.current?.isConnected) back.current.focus();
  };
  const run = (id: string) => {
    close(true);
    if (back.current?.closest(".pd-content")) focusEditor();
    runCommand(id);
  };

  return (
    <div className="palette-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Command search">
        <input
          className="field"
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results[at] ? `cmd-${results[at]!.c.id}` : undefined}
          aria-label="Search commands"
          placeholder="Search commands"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
            else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            else if (e.key === "Enter") {
              const r = results[at];
              if (r && (!r.c.enabled || r.c.enabled())) run(r.c.id);
            } else if (e.key === "Escape") close();
            else return;
            e.preventDefault();
            e.stopPropagation();
          }}
        />
        <ul id="palette-list" role="listbox" aria-label="Commands" className="palette-list">
          {results.map(({ c, label, path }, i) => {
            const disabled = c.enabled ? !c.enabled() : false;
            return (
              <li
                key={c.id}
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={i === at}
                aria-disabled={disabled || undefined}
                className="palette-item"
                onPointerEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => !disabled && run(c.id)}
              >
                <span className="palette-label">{label}</span>
                <span className="palette-path">{path}</span>
                {shownChord(c) ? <kbd>{shownChord(c)}</kbd> : null}
              </li>
            );
          })}
          {!results.length ? <li className="empty">No commands match.</li> : null}
        </ul>
      </div>
    </div>
  );
}
