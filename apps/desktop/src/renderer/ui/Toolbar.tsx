/** The toolbar (V2): one row of grouped controls with roving focus; each name carries its shortcut. */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type ReactNode, type KeyboardEvent } from "react";
import {
  ArrowRedo20Regular,
  ArrowUndo20Regular,
  ChevronDown16Regular,
  CommentAdd20Regular,
  CommentEdit20Regular,
  Edit20Regular,
  Eye20Regular,
  Highlight20Regular,
  Image20Regular,
  Link20Regular,
  MoreHorizontal20Regular,
  Print20Regular,
  Search20Regular,
  Subtract20Regular,
  Add20Regular,
  Table20Regular,
  TaskListLtr20Regular,
  TextAlignCenter20Regular,
  TextAlignJustify20Regular,
  TextAlignLeft20Regular,
  TextAlignRight20Regular,
  TextBold20Regular,
  TextBulletListLtr20Regular,
  TextClearFormatting20Regular,
  TextColor20Regular,
  TextIndentDecreaseLtr20Regular,
  TextIndentIncreaseLtr20Regular,
  TextItalic20Regular,
  TextLineSpacing20Regular,
  TextNumberListLtr20Regular,
  TextStrikethrough20Regular,
  TextUnderline20Regular,
} from "@fluentui/react-icons";
import { SANS } from "@p-doc/core";
import { COMMANDS, fontSizeAt, runCommand, setFontSize, shownChord, STYLE_NAMES, ZOOMS } from "../commands.ts";
import { currentStyle, applyStyle } from "../editor/blocks.ts";
import { getEditor, focusEditor } from "../session.ts";
import { app, updateSettings } from "../state.ts";
import { MODE_NAMES } from "../review.ts";
import { history } from "../versions.ts";
import { MenuList, useOutside } from "./Menu.tsx";
import { toSpecs } from "./MenuBar.tsx";

export const FONTS: [string, string][] = [
  ["Aptos", SANS],
  ["Arial", "Arial, Helvetica, sans-serif"],
  ["Calibri", "Calibri, Carlito, sans-serif"],
  ["Cambria", "Cambria, Caladea, serif"],
  ["Georgia", "Georgia, serif"],
  ["Segoe UI", "'Segoe UI', system-ui, sans-serif"],
  ["Times New Roman", "'Times New Roman', Times, serif"],
  ["Verdana", "Verdana, sans-serif"],
  ["Consolas", "Consolas, 'Courier New', monospace"],
  ["Courier New", "'Courier New', Courier, monospace"],
];

const TEXT_COLOURS: [string, string][] = [
  ["Black", "#000000"],
  ["Dark grey", "#434343"],
  ["Grey", "#666666"],
  ["Light grey", "#999999"],
  ["Red", "#c5221f"],
  ["Orange", "#e8710a"],
  ["Yellow", "#f9ab00"],
  ["Green", "#188038"],
  ["Teal", "#12858a"],
  ["Blue", "#1a73e8"],
  ["Dark blue", "#174ea6"],
  ["Purple", "#8430ce"],
  ["Magenta", "#b80672"],
  ["Brown", "#7b4f2c"],
];
const HIGHLIGHTS: [string, string][] = [
  ["Yellow", "#fff475"],
  ["Green", "#ccff90"],
  ["Cyan", "#a7ffeb"],
  ["Blue", "#cbf0f8"],
  ["Pink", "#fdcfe8"],
  ["Orange", "#fbbc04"],
  ["Grey", "#e8eaed"],
];

const name = (id: string) => {
  const c = COMMANDS.get(id);
  if (!c) return id;
  const k = shownChord(c);
  return k ? `${c.label} (${k})` : c.label;
};

function Btn({ id, icon, label, pressed, onClick, disabled, first }: { id?: string; icon: ReactNode; label?: string; pressed?: boolean; onClick?: () => void; disabled?: boolean; first?: boolean }) {
  const c = id ? COMMANDS.get(id) : undefined;
  const text = label ?? (id ? name(id) : "");
  const isPressed = pressed ?? (c?.checked ? c.checked() : undefined);
  const isDisabled = disabled ?? (c?.enabled ? !c.enabled() : false);
  return (
    <button
      type="button"
      className="tb-btn"
      data-tb
      tabIndex={first ? 0 : -1}
      aria-label={text}
      title={text}
      aria-pressed={isPressed}
      disabled={isDisabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick ?? (() => id && runCommand(id))}
    >
      {icon}
    </button>
  );
}

/** A button that opens a floating panel. */
function Drop({ label, icon, children, wide, more, end, disabled, className }: { label: string; icon: ReactNode; children: (close: () => void) => ReactNode; wide?: boolean; more?: boolean; end?: boolean; disabled?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useOutside(ref, open, close);
  return (
    <div ref={ref} className={`tb-drop${more ? " tb-more-drop" : ""}${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className={`tb-btn${wide ? " wide" : ""}`}
        data-tb
        tabIndex={-1}
        aria-label={label}
        title={label}
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled ?? (!more && !getEditor()?.isEditable)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {icon}
        {more ? null : <ChevronDown16Regular aria-hidden />}
      </button>
      {open ? (
        <div
          className={`popover${more || end ? " end" : ""}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
              ref.current?.querySelector<HTMLElement>("[data-tb]")?.focus();
            }
          }}
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

function MenuDrop({ label, icon, items, end, disabled, className, wide }: { label: string; icon: ReactNode; items: string[]; end?: boolean; disabled?: boolean; className?: string; wide?: boolean }) {
  return (
    <Drop label={label} icon={icon} end={end} disabled={disabled} className={className} wide={wide}>
      {(close) => (
        <MenuList
          items={toSpecs(items)}
          label={label}
          onClose={(restore) => {
            close();
            if (restore) focusEditor();
          }}
        />
      )}
    </Drop>
  );
}

function Swatches({ label, colours, current, onPick, resetLabel, close }: { label: string; colours: [string, string][]; current: string | null; onPick: (c: string | null) => void; resetLabel: string; close: () => void }) {
  return (
    <div role="group" aria-label={label} className="swatches">
      <button
        type="button"
        className="btn subtle swatch-reset"
        autoFocus
        onClick={() => {
          onPick(null);
          close();
        }}
      >
        {resetLabel}
      </button>
      <div className="swatch-grid">
        {colours.map(([n, c]) => (
          <button
            key={c}
            type="button"
            className="swatch"
            aria-label={n}
            title={n}
            aria-pressed={current?.toLowerCase() === c}
            style={{ "--swatch": c } as CSSProperties}
            onClick={() => {
              onPick(c);
              close();
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** The overflow panel: the groups that don't fit, with arrow keys among them; a plain command closes it. */
function MoreGroups({ groups, close }: { groups: ReactNode[]; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const items = () => [...ref.current!.querySelectorAll<HTMLElement>("[data-tb]")].filter((b) => b.closest(".popover") === ref.current!.parentElement && !(b as HTMLButtonElement).disabled);
  useEffect(() => {
    const first = items()[0];
    if (first) {
      first.tabIndex = 0;
      first.focus();
    }
  }, []);
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="More formatting"
      className="tb-more"
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Home" && e.key !== "End") return;
        const t = e.target as HTMLElement;
        const all = items();
        if (t.tagName === "INPUT" || t.tagName === "SELECT" || !all.includes(t)) return;
        if (e.key === "ArrowDown" && t.getAttribute("aria-haspopup")) return;
        const i = all.indexOf(t);
        const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
        const n = e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : (i + (back ? -1 : 1) + all.length) % all.length;
        e.preventDefault();
        e.stopPropagation();
        for (const b of all) b.tabIndex = b === all[n] ? 0 : -1;
        all[n]?.focus();
      }}
      onClick={(e) => {
        const b = (e.target as HTMLElement).closest("button");
        if (b?.classList.contains("tb-btn") && !b.hasAttribute("aria-haspopup") && b.closest(".popover") === ref.current!.parentElement) close();
      }}
    >
      {groups.map((g, i) => (
        <div key={i} className="tb-group">
          {g}
        </div>
      ))}
    </div>
  );
}

function TableGrid({ close }: { close: () => void }) {
  const [at, setAt] = useState<[number, number]>([1, 1]);
  const pick = (r: number, c: number) => {
    getEditor()?.chain().focus().insertTable({ rows: r, cols: c, withHeaderRow: false }).run();
    close();
  };
  return (
    <div className="table-grid-wrap">
      <div className="table-grid" role="grid" aria-label="Table size">
        {Array.from({ length: 8 }, (_, r) => (
          <div role="row" key={r} className="table-grid-row">
            {Array.from({ length: 8 }, (_, c) => (
              <button
                key={c}
                type="button"
                role="gridcell"
                aria-label={`${r + 1} by ${c + 1}`}
                className={`table-cell${r < at[0] && c < at[1] ? " on" : ""}`}
                autoFocus={r === 0 && c === 0}
                onPointerEnter={() => setAt([r + 1, c + 1])}
                onFocus={() => setAt([r + 1, c + 1])}
                onClick={() => pick(r + 1, c + 1)}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="table-grid-label" aria-live="polite">
        {at[0]} × {at[1]}
      </div>
    </div>
  );
}

export function Toolbar() {
  app.use((s) => s.tick);
  const zoom = app.use((s) => s.settings?.zoom ?? 100);
  app.use((s) => s.doc?.styles);
  const mode = app.use((s) => s.mode);
  app.use((s) => s.markup);
  history.use((s) => s.viewing);
  const ref = useRef<HTMLDivElement>(null);
  const editor = getEditor();
  const editable = !!editor?.isEditable;
  const style = editor ? currentStyle(editor) : null;
  const size = editor ? fontSizeAt(editor) : 11;
  const family = (editor?.getAttributes("textStyle").fontFamily as string | undefined) ?? "";
  const fontLabel = FONTS.find(([, v]) => v === family)?.[0] ?? (family ? family.split(",")[0]!.replace(/['"]/g, "") : "Aptos");
  const [sizeText, setSizeText] = useState<string | null>(null);
  const [fit, setFit] = useState(Number.POSITIVE_INFINITY);
  const widths = useRef<number[]>([]);
  const count = useRef(0);

  // Groups that don't fit move, from the end, into More (V2). Widths are kept from when each group was last shown.
  useLayoutEffect(() => {
    const bar = ref.current!;
    const measure = () => {
      for (const el of bar.querySelectorAll<HTMLElement>(":scope > [data-group]")) widths.current[Number(el.dataset.group)] = el.getBoundingClientRect().width;
      const cs = getComputedStyle(bar);
      const gap = parseFloat(cs.columnGap) || 0;
      const fixed = bar.querySelector<HTMLElement>(":scope > .tb-fixed")?.getBoundingClientRect().width ?? 0;
      const room = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (fixed ? fixed + gap : 0);
      const more = (bar.querySelector<HTMLElement>(".tb-btn")?.getBoundingClientRect().width ?? 0) * 1.5 + gap * 2;
      const upTo = (k: number) => widths.current.slice(0, k).reduce((a, w) => a + w + gap, 0) - gap;
      const n = count.current;
      let k = n;
      if (upTo(n) > room) {
        k = n - 1;
        while (k > 1 && upTo(k) + gap + more > room) k--;
      }
      setFit((f) => (f === k || (f > n && k === n) ? f : k));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const inline = (el: Element) => !el.closest(".popover");
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "SELECT" || !t.hasAttribute("data-tb") || !inline(t)) return;
    const all = [...ref.current!.querySelectorAll<HTMLElement>("[data-tb]")].filter((b) => inline(b) && !(b as HTMLButtonElement).disabled);
    const i = all.indexOf(t);
    const n = e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + all.length) % all.length;
    e.preventDefault();
    all[n]?.focus();
  };
  // One stop in the Tab order: the first control, then arrows.
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (!inline(e.target)) return;
    for (const b of ref.current!.querySelectorAll<HTMLElement>("[data-tb]")) if (inline(b)) b.tabIndex = b === e.target ? 0 : -1;
  };

  const groups: ReactNode[] = [
    <>
        <Btn id="tools.search" icon={<Search20Regular />} first />
    </>,
    <>
        <Btn id="edit.undo" icon={<ArrowUndo20Regular />} />
        <Btn id="edit.redo" icon={<ArrowRedo20Regular />} />
        <Btn id="file.print" icon={<Print20Regular />} />
    </>,
    <>
        <select
          className="tb-select"
          data-tb
          tabIndex={-1}
          aria-label="Zoom"
          title="Zoom"
          value={zoom}
          onChange={(e) => {
            void updateSettings({ zoom: Number(e.target.value) });
            focusEditor();
          }}
        >
          {ZOOMS.map((z) => (
            <option key={z} value={z}>
              {z}%
            </option>
          ))}
        </select>
    </>,
    <>
        <select
          className="tb-select style"
          data-tb
          tabIndex={-1}
          aria-label="Paragraph style"
          title="Paragraph style (Ctrl+Alt+0 to 4)"
          value={style ?? ""}
          disabled={!editable}
          onChange={(e) => {
            if (editor) applyStyle(editor, e.target.value as never);
          }}
        >
          {style == null ? <option value="">—</option> : null}
          {(Object.keys(STYLE_NAMES) as (keyof typeof STYLE_NAMES)[]).map((k) => (
            <option key={k} value={k}>
              {STYLE_NAMES[k]}
            </option>
          ))}
        </select>
        <select
          className="tb-select font"
          data-tb
          tabIndex={-1}
          aria-label="Font"
          title="Font"
          value={fontLabel}
          disabled={!editable}
          onChange={(e) => {
            const f = FONTS.find(([n]) => n === e.target.value);
            if (!editor || !f) return;
            if (f[1] === SANS) editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(f[1]).run();
          }}
        >
          {FONTS.some(([n]) => n === fontLabel) ? null : <option value={fontLabel}>{fontLabel}</option>}
          {FONTS.map(([n]) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
    </>,
    <>
        <Btn id="format.sizeDown" icon={<Subtract20Regular />} />
        <input
          className="tb-size"
          data-tb
          tabIndex={-1}
          aria-label="Font size"
          title="Font size"
          inputMode="decimal"
          disabled={!editable}
          value={sizeText ?? String(size)}
          onFocus={(e) => {
            setSizeText(String(size));
            e.target.select();
          }}
          onChange={(e) => setSizeText(e.target.value)}
          onBlur={() => setSizeText(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const n = Number(sizeText);
              if (editor && Number.isFinite(n) && n > 0) setFontSize(editor, n);
              setSizeText(null);
            } else if (e.key === "Escape") {
              setSizeText(null);
              editor?.commands.focus();
            }
          }}
        />
        <Btn id="format.sizeUp" icon={<Add20Regular />} />
    </>,
    <>
        <Btn id="format.bold" icon={<TextBold20Regular />} />
        <Btn id="format.italic" icon={<TextItalic20Regular />} />
        <Btn id="format.underline" icon={<TextUnderline20Regular />} />
        <Btn id="format.strike" icon={<TextStrikethrough20Regular />} />
        <Drop label="Text colour" icon={<TextColor20Regular />}>
          {(close) => (
            <Swatches
              label="Text colour"
              resetLabel="Automatic"
              colours={TEXT_COLOURS}
              current={(editor?.getAttributes("textStyle").color as string) ?? null}
              close={close}
              onPick={(c) => (c ? editor?.chain().focus().setColor(c).run() : editor?.chain().focus().unsetColor().run())}
            />
          )}
        </Drop>
        <Drop label="Highlight colour" icon={<Highlight20Regular />}>
          {(close) => (
            <Swatches
              label="Highlight colour"
              resetLabel="None"
              colours={HIGHLIGHTS}
              current={(editor?.getAttributes("highlight").color as string) ?? null}
              close={close}
              onPick={(c) => (c ? editor?.chain().focus().setHighlight({ color: c }).run() : editor?.chain().focus().unsetHighlight().run())}
            />
          )}
        </Drop>
    </>,
    <>
        <Btn id="insert.link" icon={<Link20Regular />} pressed={editor?.isActive("link")} />
        <Btn id="insert.image" icon={<Image20Regular />} />
        <Drop label="Insert table" icon={<Table20Regular />}>
          {(close) => <TableGrid close={close} />}
        </Drop>
    </>,
    <>
        <MenuDrop
          label="Align"
          icon={editor?.isActive({ textAlign: "center" }) ? <TextAlignCenter20Regular /> : editor?.isActive({ textAlign: "right" }) ? <TextAlignRight20Regular /> : editor?.isActive({ textAlign: "justify" }) ? <TextAlignJustify20Regular /> : <TextAlignLeft20Regular />}
          items={["align.left", "align.center", "align.right", "align.justify"]}
        />
        <MenuDrop label="Line and paragraph spacing" icon={<TextLineSpacing20Regular />} items={["spacing.1", "spacing.1.15", "spacing.1.5", "spacing.2", "-", "spacing.before", "spacing.after"]} />
    </>,
    <>
        <Btn id="list.checklist" icon={<TaskListLtr20Regular />} />
        <Btn id="list.bullets" icon={<TextBulletListLtr20Regular />} />
        <Btn id="list.numbers" icon={<TextNumberListLtr20Regular />} />
        <Btn id="indent.less" icon={<TextIndentDecreaseLtr20Regular />} />
        <Btn id="indent.more" icon={<TextIndentIncreaseLtr20Regular />} />
    </>,
    <>
        <Btn id="format.clear" icon={<TextClearFormatting20Regular />} />
    </>,
    <>
        <Btn id="insert.comment" icon={<CommentAdd20Regular />} />
    </>,
  ];
  count.current = groups.length;
  const ModeIcon = mode === "suggesting" ? CommentEdit20Regular : mode === "viewing" ? Eye20Regular : Edit20Regular;

  return (
    <div ref={ref} role="toolbar" aria-label="Formatting" className="toolbar" data-region onKeyDown={onKeyDown} onFocus={onFocus}>
      {groups.slice(0, fit).map((g, i) => (
        <div key={i} className="tb-group" data-group={i}>
          {i ? <span className="tb-sep" role="separator" /> : null}
          {g}
        </div>
      ))}
      {fit < groups.length ? (
        <div className="tb-group">
          <span className="tb-sep" role="separator" />
          <Drop label="More" icon={<MoreHorizontal20Regular />} more>
            {(close) => <MoreGroups groups={groups.slice(fit)} close={close} />}
          </Drop>
        </div>
      ) : null}
      <div className="tb-group tb-fixed">
        <MenuDrop
          label={`Mode: ${MODE_NAMES[mode]}`}
          className="tb-mode"
          wide
          end
          disabled={!editor}
          icon={
            <>
              <ModeIcon aria-hidden />
              <span className="tb-mode-name">{MODE_NAMES[mode]}</span>
            </>
          }
          items={["mode.editing", "mode.suggesting", "mode.viewing"]}
        />
      </div>
    </div>
  );
}
