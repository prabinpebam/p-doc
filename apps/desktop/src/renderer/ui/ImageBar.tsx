/** The image bar (V11, U40): over a selected image, its wrap, alignment, crop, replace, alt text and size. */
import { useEffect, useState, type ReactNode } from "react";
import {
  AlignCenterHorizontal20Regular,
  AlignLeft20Regular,
  AlignRight20Regular,
  ArrowReset20Regular,
  ArrowSwap20Regular,
  Checkmark20Regular,
  Crop20Regular,
  CropArrowRotate20Regular,
  Dismiss20Regular,
  ImageAltText20Regular,
  Options20Regular,
  TextPositionLine20Regular,
  TextPositionSquareLeft20Regular,
  TextPositionSquareRight20Regular,
} from "@fluentui/react-icons";
import { cleanCrop } from "@p-doc/core";
import { COMMANDS, runCommand } from "../commands.ts";
import { imageUi, selectedImage } from "../editor/image.ts";
import { getEditor } from "../session.ts";
import { app } from "../state.ts";

function Btn({ id, icon, text }: { id: string; icon: ReactNode; text?: boolean }) {
  const c = COMMANDS.get(id);
  if (!c) return null;
  const label = c.label.replace(/…$/, "");
  return (
    <button
      type="button"
      className={`tb-btn${text ? " wide" : ""}`}
      aria-label={label}
      title={c.label}
      aria-pressed={c.checked ? c.checked() : undefined}
      disabled={c.enabled ? !c.enabled() : false}
      data-command={id}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => runCommand(id)}
    >
      {icon}
      {text ? <span>{label}</span> : null}
    </button>
  );
}

/** Height the bar needs above a picture (px). */
const ROOM = 56;

const Sep = () => <span className="tb-sep" role="separator" />;

export function ImageBar() {
  app.use((s) => s.tick);
  const cropping = imageUi.use((s) => s.cropping);
  const [, redraw] = useState(0);
  useEffect(() => {
    const on = () => redraw((n) => n + 1);
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
    };
  }, []);
  const e = getEditor();
  if (!e || !e.isEditable) return null;
  const sel = selectedImage(e.state);
  if (!sel) return null;
  const frame = (e.view.nodeDOM(sel.pos) as HTMLElement | null)?.querySelector<HTMLElement>(".pd-img-frame");
  if (!frame) return null;
  const r = frame.getBoundingClientRect();
  const scroller = frame.closest(".page-scroll")?.getBoundingClientRect();
  const top = scroller ? scroller.top : 0;
  // Above the picture when there's room for the bar, else just inside its top edge.
  const above = r.top - top > ROOM;
  const style = { left: `${r.left + r.width / 2}px`, top: `${above ? r.top : Math.max(r.top, top)}px` };
  const hasCrop = !!cleanCrop(sel.node.attrs.crop);
  return (
    <div role="toolbar" aria-label="Image" className={`image-bar${above ? "" : " below"}`} style={style} data-testid="image-bar">
      {cropping ? (
        <>
          <Btn id="image.cropDone" icon={<Checkmark20Regular />} text />
          <Btn id="image.cropCancel" icon={<Dismiss20Regular />} text />
        </>
      ) : (
        <>
          <Btn id="image.inline" icon={<TextPositionLine20Regular />} />
          <Btn id="image.wrapLeft" icon={<TextPositionSquareLeft20Regular />} />
          <Btn id="image.wrapRight" icon={<TextPositionSquareRight20Regular />} />
          <Sep />
          <Btn id="image.alignLeft" icon={<AlignLeft20Regular />} />
          <Btn id="image.alignCenter" icon={<AlignCenterHorizontal20Regular />} />
          <Btn id="image.alignRight" icon={<AlignRight20Regular />} />
          <Sep />
          <Btn id="image.crop" icon={<Crop20Regular />} />
          {hasCrop ? <Btn id="image.resetCrop" icon={<CropArrowRotate20Regular />} /> : null}
          <Btn id="image.resetSize" icon={<ArrowReset20Regular />} />
          <Sep />
          <Btn id="image.replace" icon={<ArrowSwap20Regular />} />
          <Btn id="image.alt" icon={<ImageAltText20Regular />} />
          <Btn id="image.options" icon={<Options20Regular />} />
        </>
      )}
    </div>
  );
}
