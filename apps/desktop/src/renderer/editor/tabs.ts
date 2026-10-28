/**
 * Tabs (U46, spec §4.11): Tab in a paragraph types a tab, and each tab is as wide as it takes to reach
 * the paragraph's next stop (or the next default half-inch stop), as Word lays tabs out. Widths are set
 * as soon as a paragraph changes, before the page layout measures it, and print copies them.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { cleanLayout, CSS_PX_PER_INCH, tabTo } from "@p-doc/core";

const containsTab = (n: PMNode) => {
  let found = false;
  n.descendants((c) => {
    if (found) return false;
    if (c.type.name === "tab") found = true;
    return !c.isTextblock || !found;
  });
  return found;
};

/** The width of the text from after a tab to the next tab (or the paragraph's end) on its line, and up to its decimal point. */
function textAfter(el: HTMLElement, tab: HTMLElement, next: HTMLElement | undefined): { after: number; decimal: number } {
  const range = document.createRange();
  range.setStartAfter(tab);
  if (next) range.setEndBefore(next);
  else range.setEnd(el, el.childNodes.length);
  const first = range.getClientRects()[0];
  const after = first?.width ?? 0;
  // The decimal point: the first "." after the tab; with none, the end of the text (as Word aligns whole numbers).
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let decimal = after;
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    if (!(tab.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) || tab.contains(t)) continue;
    if (next && next.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) break;
    const at = t.data.indexOf(".");
    if (at < 0) continue;
    const upTo = document.createRange();
    upTo.setStartAfter(tab);
    upTo.setEnd(t, at);
    decimal = upTo.getClientRects()[0]?.width ?? 0;
    break;
  }
  return { after, decimal };
}

/** Sets the width and leader of each tab in a paragraph, from its start to its end. */
function layoutBlock(view: EditorView, el: HTMLElement, node: PMNode, scale: number): void {
  const tabs = [...el.querySelectorAll<HTMLElement>(".pd-tab")];
  if (!tabs.length) return;
  const stops = cleanLayout(node.attrs.layout)?.tabs ?? [];
  const root = view.dom.getBoundingClientRect();
  const cs = getComputedStyle(view.dom);
  const left = root.left + (parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) || 0) * scale;
  const right = root.right - (parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth) || 0) * scale;
  const rtl = getComputedStyle(el).direction === "rtl";
  const inch = CSS_PX_PER_INCH * scale;
  for (const t of tabs) t.style.width = "0px";
  tabs.forEach((t, i) => {
    const r = t.getBoundingClientRect();
    const x = (rtl ? right - r.right : r.left - left) / inch;
    const { after, decimal } = textAfter(el, t, tabs[i + 1]);
    const { stop, width } = tabTo(Math.max(0, x), stops, after / inch, decimal / inch);
    t.style.width = `${Math.round(width * CSS_PX_PER_INCH * 100) / 100}px`;
    if (stop.leader !== "none") t.dataset.leader = stop.leader;
    else delete t.dataset.leader;
  });
}

/** The page's zoom (CSS zoom on the page stack scales what the DOM measures). */
const zoomOf = (view: EditorView) => Number(view.dom.closest<HTMLElement>(".page-stack")?.style.zoom) || 1;

/** Lays out the tabs of every paragraph that changed since its tabs were set (all of them when `all`). */
export function layoutTabs(view: EditorView, all = false): void {
  const scale = zoomOf(view);
  view.state.doc.forEach((child, offset) => {
    let has = hasTabs.get(child);
    if (has === undefined) hasTabs.set(child, (has = containsTab(child)));
    if (!has) return;
    const dom = view.nodeDOM(offset);
    if (!(dom instanceof HTMLElement)) return;
    // A paragraph drawn again (its node changed, or the view rebuilt it) has tabs without widths.
    if (!all && laidOut.get(dom) === child && !dom.querySelector(".pd-tab:not([style])")) return;
    laidOut.set(dom, child);
    if (child.isTextblock) return layoutBlock(view, dom, child, scale);
    child.descendants((n, pos) => {
      if (!n.isTextblock) return true;
      const el = view.nodeDOM(offset + 1 + pos);
      if (el instanceof HTMLElement && containsTab(n)) layoutBlock(view, el, n, scale);
      return false;
    });
  });
}

const hasTabs = new WeakMap<PMNode, boolean>();
const laidOut = new WeakMap<HTMLElement, PMNode>();

export const Tabs = Extension.create({
  name: "tabs",
  addKeyboardShortcuts() {
    return {
      // Lists nest and tables move between cells on Tab (their own shortcuts run first); a code block keeps it out.
      Tab: () => {
        const e = this.editor;
        if (!e.isEditable || e.isActive("listItem") || e.isActive("taskItem") || e.isActive("table") || e.isActive("codeBlock")) return false;
        return e.chain().insertContent({ type: "tab" }).run();
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("pdoc-tabs"),
        view(view) {
          layoutTabs(view, true);
          // Text widths change when fonts arrive or the styles change (the page resizes).
          void document.fonts?.ready.then(() => !view.isDestroyed && layoutTabs(view, true));
          // A resize the document didn't cause (styles, page setup, text width) lays every tab out again.
          let seen = view.state.doc;
          const ro = new ResizeObserver(() => {
            if (view.isDestroyed) return;
            layoutTabs(view, view.state.doc === seen);
            seen = view.state.doc;
          });
          ro.observe(view.dom);
          return {
            update: (v) => layoutTabs(v),
            destroy: () => ro.disconnect(),
          };
        },
      }),
    ];
  },
});
