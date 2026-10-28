/**
 * View > Show ruler (U46, spec §4.11): the margins, the indents of the paragraph at the cursor and its tab stops.
 * Drag an indent or a tab to move it, click the ruler to add a tab of the kind shown at its left, drag a tab off
 * to remove it. Each marker is also a slider: arrow keys move it, Delete removes a tab.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { cleanLayout, indentFromPositions, indentPositions, type ParaLayout, type TabAlign, type TabStop } from "@p-doc/core";
import { setParagraphFormat } from "../editor/blocks.ts";
import { pageLayout } from "../editor/pages.ts";
import { getEditor } from "../session.ts";
import { app, openDialog } from "../state.ts";
import { usesInches } from "./PageDialogs.tsx";

/** Where things sit, in px from the ruler's left edge, and how many px an inch is at this zoom. */
interface Frame {
  pageL: number;
  pageR: number;
  textL: number;
  textR: number;
  ppi: number;
  rtl: boolean;
  /** The ruler's left and bottom edges in the window, where a drag's guide line is drawn from. */
  left: number;
  bottom: number;
}

interface Para {
  first: number;
  body: number;
  right: number;
  tabs: TabStop[];
}

type Marker = "first" | "hanging" | "left" | "right" | number;

const KINDS: readonly TabAlign[] = ["left", "center", "right", "decimal"];
const KIND_NAMES: Record<TabAlign, string> = { left: "Left", center: "Centre", right: "Right", decimal: "Decimal" };
const MARKER_NAMES: Record<"first" | "hanging" | "left" | "right", string> = { first: "First line indent", hanging: "Hanging indent", left: "Left indent", right: "Right indent" };

function measure(ruler: HTMLElement): { frame: Frame; para: Para } | null {
  const ed = getEditor();
  if (!ed) return null;
  const view = ed.view;
  const page = view.dom.closest<HTMLElement>(".page");
  if (!page) return null;
  const zoom = Number(view.dom.closest<HTMLElement>(".page-stack")?.style.zoom) || 1;
  const $from = ed.state.selection.$from;
  let block: HTMLElement | null = null;
  let attrs: Record<string, unknown> | null = null;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (n.isTextblock) {
      const dom = view.nodeDOM($from.before(d));
      block = dom instanceof HTMLElement ? dom : null;
      attrs = n.attrs;
      break;
    }
  }
  // The text area the paragraph sits in: the page's, a list item's or a table cell's.
  const box = block?.parentElement ?? (view.dom as HTMLElement);
  const own = ruler.getBoundingClientRect();
  const r = box.getBoundingClientRect();
  const cs = getComputedStyle(box);
  const px = (v: string) => (parseFloat(v) || 0) * zoom;
  const pr = page.getBoundingClientRect();
  const l: ParaLayout = cleanLayout(attrs?.layout) ?? {};
  const at = indentPositions(attrs?.indent, l.first);
  return {
    frame: {
      pageL: pr.left - own.left,
      pageR: pr.right - own.left,
      textL: r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft) - own.left,
      textR: r.right - px(cs.borderRightWidth) - px(cs.paddingRight) - own.left,
      ppi: 96 * zoom,
      rtl: (block && getComputedStyle(block).direction === "rtl") || false,
      left: own.left,
      bottom: own.bottom,
    },
    para: { first: at.first, body: at.body, right: l.right ?? 0, tabs: l.tabs ?? [] },
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function Ruler() {
  const ref = useRef<HTMLDivElement>(null);
  const tick = app.use((s) => s.tick);
  const zoom = app.use((s) => s.settings?.zoom ?? 100);
  const doc = app.use((s) => s.doc);
  const sheets = pageLayout.use((s) => s.layout);
  const [m, setM] = useState<{ frame: Frame; para: Para } | null>(null);
  const [kind, setKind] = useState<TabAlign>("left");
  const [drag, setDrag] = useState<{ marker: Marker; at: number; off: boolean; moved: boolean } | null>(null);
  const inches = usesInches();
  const step = inches ? 1 / 16 : 0.25 / 2.54;

  const remeasure = () => {
    const el = ref.current;
    if (!el) return;
    const next = measure(el);
    setM((prev) => (same(prev, next) ? prev : next));
  };
  useLayoutEffect(remeasure, [tick, zoom, doc, sheets]);
  useEffect(() => {
    const scroller = ref.current?.parentElement?.querySelector(".page-scroll");
    const ro = new ResizeObserver(remeasure);
    if (scroller) ro.observe(scroller);
    scroller?.addEventListener("scroll", remeasure, { passive: true });
    window.addEventListener("resize", remeasure);
    return () => {
      ro.disconnect();
      scroller?.removeEventListener("scroll", remeasure);
      window.removeEventListener("resize", remeasure);
    };
  }, []);

  const editable = !!getEditor()?.isEditable;
  if (!m) return <div className="ruler" ref={ref} data-testid="ruler" />;
  const { frame: f, para: p } = m;
  const width = Math.max(0, (f.textR - f.textL) / f.ppi);
  const x = (inch: number) => (f.rtl ? f.textR - inch * f.ppi : f.textL + inch * f.ppi);
  const inchAt = (clientX: number) => {
    const own = ref.current!.getBoundingClientRect();
    const v = f.rtl ? (f.textR - (clientX - own.left)) / f.ppi : (clientX - own.left - f.textL) / f.ppi;
    return Math.min(width, Math.max(0, Math.round(v / step) * step));
  };
  const valueOf = (mk: Marker): number => (typeof mk === "number" ? p.tabs[mk]!.pos : mk === "first" ? p.first : mk === "right" ? width - p.right : p.body);
  const label = (v: number) => (inches ? `${r3(v)} in` : `${Math.round(v * 2.54 * 100) / 100} cm`);

  /** Puts a marker at a position (or takes a tab off), as one step that Undo reverses. */
  const commit = (mk: Marker, at: number, off = false) => {
    const ed = getEditor();
    if (!ed?.isEditable) return;
    at = r3(at);
    if (typeof mk === "number") {
      const tabs = p.tabs.filter((_, i) => i !== mk);
      if (!off) tabs.push({ ...p.tabs[mk]!, pos: at });
      return setParagraphFormat(ed, {}, { tabs: tabs.length ? tabs : null });
    }
    if (mk === "right") return setParagraphFormat(ed, {}, { right: r3(width - at) || null });
    const pos = mk === "first" ? { first: at, body: p.body } : mk === "hanging" ? { first: p.first, body: at } : { first: p.first + at - p.body, body: at };
    const next = indentFromPositions(Math.max(0, pos.first), Math.max(0, pos.body));
    setParagraphFormat(ed, { indent: next.indent }, { first: next.first || null });
  };

  const down = (mk: Marker) => (e: PointerEvent<HTMLElement>) => {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ marker: mk, at: valueOf(mk), off: false, moved: false });
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const own = ref.current!.getBoundingClientRect();
    const off = typeof drag.marker === "number" && (e.clientY > own.bottom + own.height || e.clientY < own.top - own.height);
    const at = inchAt(e.clientX);
    if (at !== drag.at || off !== drag.off) setDrag({ ...drag, at, off, moved: true });
  };
  const up = () => {
    if (!drag) return;
    setDrag(null);
    if (drag.moved) commit(drag.marker, drag.at, drag.off);
    getEditor()?.view.focus();
  };
  const key = (mk: Marker) => (e: KeyboardEvent<HTMLElement>) => {
    if (!editable) return;
    const dir = { ArrowLeft: f.rtl ? 1 : -1, ArrowRight: f.rtl ? -1 : 1 }[e.key];
    if (dir) {
      e.preventDefault();
      commit(mk, Math.min(width, Math.max(0, valueOf(mk) + dir * step * (e.shiftKey ? 4 : 1))));
    } else if ((e.key === "Delete" || e.key === "Backspace") && typeof mk === "number") {
      e.preventDefault();
      commit(mk, 0, true);
      getEditor()?.view.focus();
    }
  };

  const shown = (mk: Marker) => (drag?.marker === mk ? drag.at : valueOf(mk));
  const at = (inch: number): CSSProperties => ({ "--x": `${x(inch)}px` }) as CSSProperties;
  const slider = (mk: Marker, name: string) => ({
    role: "slider",
    tabIndex: editable ? 0 : -1,
    "aria-label": name,
    "aria-valuemin": 0,
    "aria-valuemax": r3(width),
    "aria-valuenow": r3(shown(mk)),
    "aria-valuetext": label(shown(mk)),
    "aria-disabled": !editable || undefined,
    onPointerDown: down(mk),
    onPointerMove: move,
    onPointerUp: up,
    onPointerCancel: () => setDrag(null),
    onKeyDown: key(mk),
  });

  // Ticks every eighth of an inch (or quarter centimetre) across the page, numbered from the margin.
  const unitIn = inches ? 1 : 1 / 2.54;
  const per = inches ? 8 : 4;
  const ticks: { inch: number; n: number }[] = [];
  const from = Math.ceil(((f.rtl ? f.textR - f.pageR : f.pageL - f.textL) / f.ppi / unitIn) * per);
  const to = Math.floor(((f.rtl ? f.textR - f.pageL : f.pageR - f.textL) / f.ppi / unitIn) * per);
  for (let n = from; n <= to && ticks.length < 2000; n++) ticks.push({ inch: (n / per) * unitIn, n });

  return (
    <div
      className={`ruler${drag ? " is-dragging" : ""}`}
      ref={ref}
      role="toolbar"
      aria-label="Ruler"
      data-testid="ruler"
      onMouseDown={(e) => e.preventDefault()}
      style={{ "--page-l": `${f.pageL}px`, "--page-w": `${Math.max(0, f.pageR - f.pageL)}px`, "--text-l": `${Math.min(f.textL, f.textR)}px`, "--text-w": `${Math.abs(f.textR - f.textL)}px` } as CSSProperties}
    >
      <button
        type="button"
        className="ruler-kind"
        data-kind={kind}
        aria-label={`Tab type: ${KIND_NAMES[kind]}`}
        title={`Tab type: ${KIND_NAMES[kind]}`}
        onClick={() => setKind(KINDS[(KINDS.indexOf(kind) + 1) % KINDS.length]!)}
      >
        <TabGlyph align={kind} />
      </button>
      <div
        className="ruler-page"
        data-testid="ruler-page"
        onPointerDown={(e) => {
          if (!editable || e.button !== 0) return;
          const own = ref.current!.getBoundingClientRect();
          const cx = e.clientX - own.left;
          if (cx < Math.min(f.textL, f.textR) || cx > Math.max(f.textL, f.textR)) return;
          const ed = getEditor();
          if (!ed) return;
          setParagraphFormat(ed, {}, { tabs: [...p.tabs, { pos: r3(inchAt(e.clientX)), align: kind, leader: "none" }] });
        }}
      >
        <div className="ruler-text" />
        {ticks.map((t) => (
          <span key={t.n} className={`ruler-tick${t.n % per === 0 ? " whole" : t.n % (per / 2) === 0 ? " half" : ""}`} style={at(t.inch)}>
            {t.n % per === 0 && t.n !== 0 ? Math.abs(t.n / per) : null}
          </span>
        ))}
      </div>
      <span className="ruler-mark first" data-testid="ruler-first" style={at(shown("first"))} {...slider("first", MARKER_NAMES.first)}>
        <svg viewBox="0 0 10 7" aria-hidden="true"><path d="M1 0.5h8L5 6.5z" /></svg>
      </span>
      <span className="ruler-mark hanging" data-testid="ruler-hanging" style={at(shown("hanging"))} {...slider("hanging", MARKER_NAMES.hanging)}>
        <svg viewBox="0 0 10 7" aria-hidden="true"><path d="M5 0.5L9 6.5H1z" /></svg>
      </span>
      <span className="ruler-mark left" data-testid="ruler-left" style={at(shown("left"))} {...slider("left", MARKER_NAMES.left)}>
        <svg viewBox="0 0 10 5" aria-hidden="true"><path d="M1 0.5h8v4H1z" /></svg>
      </span>
      <span className="ruler-mark right" data-testid="ruler-right" style={at(shown("right"))} {...slider("right", MARKER_NAMES.right)}>
        <svg viewBox="0 0 10 7" aria-hidden="true"><path d="M5 0.5L9 6.5H1z" /></svg>
      </span>
      {p.tabs.map((t, i) => (
        <span
          key={`${i}-${t.pos}`}
          className={`ruler-mark tab${drag?.marker === i && drag.off ? " is-off" : ""}`}
          data-testid="ruler-tab"
          data-align={t.align}
          style={at(shown(i))}
          onDoubleClick={() => openDialog({ kind: "paragraph", tab: "tabs" })}
          {...slider(i, `${KIND_NAMES[t.align]} tab`)}
        >
          <TabGlyph align={t.align} />
        </span>
      ))}
      {drag && !drag.off ? <span className="ruler-guide" style={{ "--gx": `${f.left + x(drag.at)}px`, "--y": `${f.bottom}px` } as CSSProperties} /> : null}
    </div>
  );
}

function TabGlyph({ align }: { align: TabAlign }) {
  const d = { left: "M2 1v7h6", center: "M5 1v7M1 8h8", right: "M8 1v7H2", decimal: "M5 1v7M1 8h8M8 4h1" }[align];
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
