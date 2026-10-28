/**
 * Images in the live editor (U39, U40, spec §4.9): files go to the repository's `assets/` through
 * main and show through the window's scheme; a selected image has corner handles (proportions kept,
 * Shift frees them) and a crop frame; a file that can't be drawn shows "Image missing".
 */
import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, type EditorState } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorView, NodeView } from "@tiptap/pm/view";
import { assetUrl, cleanCrop, dataImageParts, imageStyles, isAssetSrc, isDataImage, MAX_IMAGE_BYTES, PImage, type ImageCrop } from "@p-doc/core";
import { createStore } from "../lib/store.ts";

export const TOO_BIG = "This image is larger than 20 MB. Make it smaller and try again.";
export const MISSING = "Image missing";
const MIN_SIDE = 16;

/** Asset paths draw through the window's scheme; data URLs (documents from before stage 7) as they are. */
export const resolveImage = (src: string) => (isAssetSrc(src) ? assetUrl(src) : src);

/** Whether a crop frame is open, for the image bar. */
export const imageUi = createStore<{ cropping: boolean }>({ cropping: false });

let cropping: ImageView | null = null;

/** The selected image and its position, or null. */
export function selectedImage(state: EditorState): { node: PMNode; pos: number } | null {
  const sel = state.selection;
  return sel instanceof NodeSelection && sel.node.type.name === "image" ? { node: sel.node, pos: sel.from } : null;
}

/** Keeps or drops the open crop frame. */
export function endCrop(keep: boolean): void {
  cropping?.endCrop(keep);
}

/** Opens the crop frame on the selected image. */
export function startCrop(view: EditorView): void {
  const s = selectedImage(view.state);
  if (!s || !view.editable) return;
  const v = views.get(view.nodeDOM(s.pos) as HTMLElement);
  v?.startCrop();
}

const views = new WeakMap<HTMLElement, ImageView>();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

class ImageView implements NodeView {
  dom: HTMLElement;
  private frame: HTMLElement;
  private img: HTMLImageElement;
  private crop: { box: HTMLElement; layer: HTMLElement; c: ImageCrop; from: ImageCrop; shownW: number; shownH: number } | null = null;
  private src = "";

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.dom = el("div", "pd-img");
    this.dom.dataset.type = "image";
    this.frame = el("span", "pd-img-frame");
    this.img = el("img", "");
    this.img.draggable = false;
    // The picture's own inline style would show the browser's broken-image sign: hide it outright.
    this.img.addEventListener("error", () => {
      this.dom.classList.add("is-missing");
      this.img.style.display = "none";
    });
    this.img.addEventListener("load", () => {
      if (!this.dom.classList.contains("is-missing")) return;
      this.dom.classList.remove("is-missing");
      this.img.style.cssText = imageStyles(this.node.attrs).img;
    });
    const missing = el("span", "pd-img-missing", MISSING);
    missing.setAttribute("aria-hidden", "true");
    this.frame.append(this.img, missing);
    for (const corner of ["nw", "ne", "sw", "se"]) {
      const h = el("span", "pd-img-handle");
      h.dataset.corner = corner;
      h.addEventListener("mousedown", (e) => e.preventDefault());
      h.addEventListener("pointerdown", (e) => this.resize(e, corner));
      this.frame.append(h);
    }
    this.dom.append(this.frame);
    this.dom.addEventListener("dragstart", (e) => {
      if (this.crop) e.preventDefault();
    });
    views.set(this.dom, this);
    this.render();
  }

  private render(): void {
    const a = this.node.attrs;
    const s = imageStyles(a);
    this.dom.dataset.wrap = String(a.wrap);
    this.dom.dataset.align = String(a.align);
    // The same attributes the document's HTML has (core renderHTML), so print and copies read alike.
    const crop = cleanCrop(a.crop);
    const attr = (k: string, v: unknown) => (v == null ? this.dom.removeAttribute(k) : this.dom.setAttribute(k, String(v)));
    attr("data-width", a.width);
    attr("data-height", a.width && a.height ? a.height : null);
    attr("data-crop", crop ? JSON.stringify(crop) : null);
    attr("data-natural-width", a.naturalWidth);
    attr("data-natural-height", a.naturalWidth ? a.naturalHeight : null);
    this.dom.style.cssText = s.outer;
    this.frame.style.cssText = s.frame;
    this.img.style.cssText = s.img;
    const src = resolveImage(String(a.src ?? ""));
    if (src !== this.src) {
      this.src = src;
      this.dom.classList.remove("is-missing");
      if (src) this.img.src = src;
      else this.dom.classList.add("is-missing");
    }
    if (this.dom.classList.contains("is-missing")) this.img.style.display = "none";
    if (a.alt) this.img.alt = String(a.alt);
    else this.img.removeAttribute("alt");
    this.dom.setAttribute("aria-label", a.alt ? String(a.alt) : "Image");
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    if (this.crop) this.endCrop(false);
    this.node = node;
    this.render();
    return true;
  }

  selectNode(): void {
    this.dom.classList.add("ProseMirror-selectednode");
  }

  deselectNode(): void {
    this.dom.classList.remove("ProseMirror-selectednode");
    if (this.crop) this.endCrop(true);
  }

  stopEvent(e: Event): boolean {
    const t = e.target as HTMLElement | null;
    return !!t?.closest?.(".pd-img-handle, .pd-crop");
  }

  ignoreMutation(m: MutationRecord | { type: "selection"; target: Node }): boolean {
    return m.type !== "selection";
  }

  destroy(): void {
    if (cropping === this) {
      cropping = null;
      imageUi.set({ cropping: false });
    }
  }

  private setAttrs(patch: Record<string, unknown>): void {
    const pos = this.getPos();
    if (pos == null) return;
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...patch });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    this.view.dispatch(tr);
  }

  /** The widest an image may be: the text width. */
  private maxWidth(): number {
    return (this.view.dom as HTMLElement).clientWidth || 9999;
  }

  /** Corner drag: proportions kept unless Shift is held; one undo step for the whole drag. */
  private resize(e: PointerEvent, corner: string): void {
    if (!this.view.editable || this.crop || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = this.getPos();
    if (pos != null && !(this.view.state.selection instanceof NodeSelection && this.view.state.selection.from === pos))
      this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)));
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const rect = this.frame.getBoundingClientRect();
    const scale = rect.width / (this.frame.offsetWidth || 1) || 1;
    const w0 = this.frame.offsetWidth;
    const h0 = this.frame.offsetHeight || 1;
    const sx = corner.includes("w") ? -1 : 1;
    const sy = corner.includes("n") ? -1 : 1;
    const maxW = this.maxWidth();
    let w = w0;
    let h = h0;
    let free = false;
    this.dom.classList.add("is-resizing");
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - e.clientX) / scale) * sx;
      const dy = ((ev.clientY - e.clientY) / scale) * sy;
      free = ev.shiftKey;
      if (free) {
        w = clamp(w0 + dx, MIN_SIDE, maxW);
        h = Math.max(MIN_SIDE, h0 + dy);
      } else {
        const r = h0 / w0;
        w = clamp(Math.abs(dx) >= Math.abs(dy / r) ? w0 + dx : w0 + dy / r, MIN_SIDE, maxW);
        h = w * r;
      }
      this.frame.style.width = `${w}px`;
      this.frame.style.height = `${h}px`;
      this.frame.style.aspectRatio = "auto";
      if (!this.node.attrs.crop) this.img.style.height = "100%";
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      this.dom.classList.remove("is-resizing");
      if (Math.abs(w - w0) < 1 && Math.abs(h - h0) < 1) return this.render();
      const keepFreed = free || this.node.attrs.height != null;
      this.setAttrs({ width: Math.round(w), height: keepFreed ? Math.round(h) : null });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  /** The whole picture with a frame over the part shown; the stored file never changes. */
  startCrop(): void {
    if (this.crop || this.dom.classList.contains("is-missing")) return;
    cropping?.endCrop(true);
    const from = cleanCrop(this.node.attrs.crop) ?? { x: 0, y: 0, w: 1, h: 1 };
    const shownW = this.frame.offsetWidth;
    const shownH = this.frame.offsetHeight;
    let fullW = shownW / from.w;
    let fullH = shownH / from.h;
    const fit = Math.min(1, this.maxWidth() / fullW);
    fullW *= fit;
    fullH *= fit;
    this.frame.style.cssText = `display: inline-block; position: relative; vertical-align: top; width: ${fullW}px; height: ${fullH}px`;
    this.img.style.cssText = "display: block; width: 100%; height: 100%";
    const layer = el("span", "pd-crop");
    layer.contentEditable = "false";
    const box = el("span", "pd-crop-box");
    for (const edge of ["n", "s", "e", "w", "nw", "ne", "sw", "se"]) {
      const h = el("span", "pd-crop-handle");
      h.dataset.edge = edge;
      box.append(h);
    }
    box.style.backgroundImage = `url("${this.src.replace(/"/g, "%22")}")`;
    layer.append(box);
    layer.addEventListener("mousedown", (ev) => ev.preventDefault());
    layer.addEventListener("pointerdown", (ev) => this.dragCrop(ev));
    this.frame.append(layer);
    this.crop = { box, layer, c: { ...from }, from, shownW, shownH };
    this.dom.classList.add("is-cropping");
    this.layoutCrop();
    cropping = this;
    imageUi.set({ cropping: true });
  }

  private layoutCrop(): void {
    if (!this.crop) return;
    const { box, c, layer } = this.crop;
    const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
    box.style.left = pct(c.x);
    box.style.top = pct(c.y);
    box.style.width = pct(c.w);
    box.style.height = pct(c.h);
    // The kept part shows at full strength: the same picture, placed to line up with the dimmed one.
    const w = layer.offsetWidth;
    const h = layer.offsetHeight;
    box.style.backgroundSize = `${w}px ${h}px`;
    box.style.backgroundPosition = `${-c.x * w}px ${-c.y * h}px`;
  }

  private dragCrop(e: PointerEvent): void {
    if (!this.crop || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.target as HTMLElement;
    const edge = target.dataset.edge ?? (target.closest(".pd-crop-box") ? "move" : null);
    if (!edge) return;
    const layer = this.crop.layer;
    layer.setPointerCapture(e.pointerId);
    const rect = layer.getBoundingClientRect();
    const c0 = { ...this.crop.c };
    const min = 0.05;
    const move = (ev: PointerEvent) => {
      if (!this.crop) return;
      const dx = (ev.clientX - e.clientX) / rect.width;
      const dy = (ev.clientY - e.clientY) / rect.height;
      const c = { ...c0 };
      if (edge === "move") {
        c.x = clamp(c0.x + dx, 0, 1 - c0.w);
        c.y = clamp(c0.y + dy, 0, 1 - c0.h);
      } else {
        if (edge.includes("w")) {
          c.x = clamp(c0.x + dx, 0, c0.x + c0.w - min);
          c.w = c0.x + c0.w - c.x;
        }
        if (edge.includes("e")) c.w = clamp(c0.w + dx, min, 1 - c0.x);
        if (edge.includes("n")) {
          c.y = clamp(c0.y + dy, 0, c0.y + c0.h - min);
          c.h = c0.y + c0.h - c.y;
        }
        if (edge.includes("s")) c.h = clamp(c0.h + dy, min, 1 - c0.y);
      }
      this.crop.c = c;
      this.layoutCrop();
    };
    const up = () => {
      layer.removeEventListener("pointermove", move);
      layer.removeEventListener("pointerup", up);
      layer.removeEventListener("pointercancel", up);
    };
    layer.addEventListener("pointermove", move);
    layer.addEventListener("pointerup", up);
    layer.addEventListener("pointercancel", up);
  }

  /** Enter or a press outside keeps the crop; Esc drops it. The shown scale of the picture stays. */
  endCrop(keep: boolean): void {
    const crop = this.crop;
    if (!crop) return;
    this.crop = null;
    if (cropping === this) cropping = null;
    imageUi.set({ cropping: false });
    crop.layer.remove();
    this.dom.classList.remove("is-cropping");
    const { c, from, shownW, shownH } = crop;
    const same = Math.abs(c.x - from.x) < 1e-4 && Math.abs(c.y - from.y) < 1e-4 && Math.abs(c.w - from.w) < 1e-4 && Math.abs(c.h - from.h) < 1e-4;
    if (!keep || same) return this.render();
    const width = Math.max(MIN_SIDE, Math.round((shownW / from.w) * c.w));
    const height = this.node.attrs.height != null ? Math.max(MIN_SIDE, Math.round((shownH / from.h) * c.h)) : null;
    this.setAttrs({ crop: cleanCrop(c), width, height });
  }
}

/** The image node of the live editor: the shared one, drawn by `ImageView`. */
export const LiveImage = PImage.extend({
  addNodeView() {
    return ({ node, editor, getPos }) => new ImageView(node, editor.view, getPos as () => number | undefined);
  },
}).configure({ resolve: resolveImage });

// ------------------------------------------------------------------------------ Files in

export interface ImageHost {
  /** Writes picture bytes to the open document's repository; resolves to the stored image. */
  put(bytes: Uint8Array): Promise<{ src: string; width: number; height: number }>;
  onError(message: string): void;
}

const IMAGE_TYPES = /^image\/(png|jpeg|gif|webp|bmp|svg\+xml)$/;
export const imagesOf = (list: FileList | null | undefined) => [...(list ?? [])].filter((f) => f.type.startsWith("image/"));

/** The natural size a new image is shown at: its own, up to the text width. */
function fitWidth(view: EditorView, width: number): number | null {
  const max = (view.dom as HTMLElement).clientWidth;
  return max && width > max ? max : null;
}

/** Stores each picture once, then puts it at a position (or the selection); larger than 20 MB is refused. */
export async function insertImageFiles(view: EditorView, host: ImageHost, files: File[], at: number | null): Promise<void> {
  for (const f of files) {
    if (f.size > MAX_IMAGE_BYTES) {
      host.onError(TOO_BIG);
      continue;
    }
    if (!IMAGE_TYPES.test(f.type) && f.type !== "") {
      host.onError("This file isn't an image P-Doc can show. Use PNG, JPEG, GIF, WebP, SVG or BMP.");
      continue;
    }
    let stored: Awaited<ReturnType<ImageHost["put"]>>;
    try {
      stored = await host.put(new Uint8Array(await f.arrayBuffer()));
    } catch (e) {
      host.onError(String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
      continue;
    }
    if (view.isDestroyed) return;
    const node = view.state.schema.nodes.image!.create({
      src: stored.src,
      alt: f.name.replace(/\.[^.]+$/, "") || null,
      naturalWidth: stored.width || null,
      naturalHeight: stored.height || null,
      width: stored.width ? fitWidth(view, stored.width) : null,
    });
    const where = at == null ? null : Math.min(at, view.state.doc.content.size);
    const tr = where == null ? view.state.tr.replaceSelectionWith(node) : view.state.tr.insert(where, node);
    view.dispatch(tr.scrollIntoView());
  }
}

/** Puts a new picture in place of an image, keeping its width, alignment, wrap and alt text. */
export async function replaceImageFile(view: EditorView, host: ImageHost, pos: number, file: File): Promise<void> {
  if (file.size > MAX_IMAGE_BYTES) return host.onError(TOO_BIG);
  let stored: Awaited<ReturnType<ImageHost["put"]>>;
  try {
    stored = await host.put(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return host.onError(String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
  }
  const node = view.state.doc.nodeAt(pos);
  if (view.isDestroyed || node?.type.name !== "image") return;
  const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: stored.src, naturalWidth: stored.width || null, naturalHeight: stored.height || null, crop: null, height: null });
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)));
}

/**
 * Pictures pasted as HTML arrive as data URLs: each is stored once in `assets/` and the image is
 * pointed at it, so the document stays small. Runs after the paste; undo takes back the paste with it.
 */
export async function storePastedImages(view: EditorView, host: ImageHost): Promise<void> {
  const found = new Map<string, number[]>();
  view.state.doc.descendants((n, pos) => {
    if (n.type.name === "image" && isDataImage(n.attrs.src)) found.set(n.attrs.src, [...(found.get(n.attrs.src) ?? []), pos]);
    return n.isBlock;
  });
  for (const src of found.keys()) {
    const parts = dataImageParts(src);
    if (!parts) continue;
    if (parts.bytes.length > MAX_IMAGE_BYTES) {
      host.onError(TOO_BIG);
      continue;
    }
    let stored: Awaited<ReturnType<ImageHost["put"]>>;
    try {
      stored = await host.put(parts.bytes);
    } catch {
      // Left as it is: saving stores it beside the document all the same.
      continue;
    }
    if (view.isDestroyed) return;
    const tr = view.state.tr;
    view.state.doc.descendants((n, pos) => {
      if (n.type.name === "image" && n.attrs.src === src)
        tr.setNodeMarkup(pos, undefined, { ...n.attrs, src: stored.src, naturalWidth: n.attrs.naturalWidth ?? stored.width ?? null, naturalHeight: n.attrs.naturalHeight ?? stored.height ?? null });
      return n.isBlock;
    });
    if (tr.docChanged) view.dispatch(tr.setMeta("addToHistory", false));
  }
}

/** Paste, drop and the crop frame's keys. */
export function ImageFiles(host: () => ImageHost) {
  return Extension.create({
    name: "imageFiles",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            handlePaste(view, event) {
              const files = imagesOf(event.clipboardData?.files);
              if (!files.length) return false;
              void insertImageFiles(view, host(), files, null);
              return true;
            },
            handleDrop(view, event, _slice, moved) {
              if (moved) return false;
              const files = imagesOf(event.dataTransfer?.files);
              if (!files.length) return false;
              const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null;
              void insertImageFiles(view, host(), files, at);
              return true;
            },
            handleKeyDown(_view, event) {
              if (!cropping) return false;
              if (event.key === "Enter" || event.key === "Escape") {
                event.preventDefault();
                cropping.endCrop(event.key === "Enter");
                return true;
              }
              return false;
            },
            handleDOMEvents: {
              mousedown(_view, event) {
                if (cropping && !cropping.dom.contains(event.target as Node)) cropping.endCrop(true);
                return false;
              },
            },
          },
          appendTransaction(trs, _old, state) {
            void state;
            if (trs.some((t) => t.getMeta("uiEvent") === "paste" || t.getMeta("uiEvent") === "drop")) {
              const view = viewOf.view;
              if (view) queueMicrotask(() => void storePastedImages(view, host()));
            }
            return null;
          },
          view(view) {
            viewOf.view = view;
            return {
              destroy() {
                if (viewOf.view === view) viewOf.view = null;
              },
            };
          },
        }),
      ];
    },
  });
}

const viewOf: { view: EditorView | null } = { view: null };
