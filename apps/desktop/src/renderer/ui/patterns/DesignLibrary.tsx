/**
 * The design library: every fundamental and shared control rendered from its source, in each state,
 * light and dark side by side (Ctrl+Alt+Shift+D, or "Design system" in command search). What it shows
 * is what the app uses, so it can't drift from the product.
 */
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Settings16Regular } from "@fluentui/react-icons";
import { closeDialog } from "../../state.ts";
import { Dialog } from "../components/Dialog.tsx";
import { ListBox } from "../primitives/ListBox.tsx";
import { Select } from "../primitives/Select.tsx";

const COLOURS = ["bg", "bg-raised", "canvas", "field", "hover", "selected", "divider", "rule", "text", "text-muted", "accent", "accent-fill", "focus", "positive", "negative"];
const TEXT = ["xs", "sm", "md", "lg", "xl", "2xl"];
const FONTS = ["Calibri", "Cambria", "Consolas", "Georgia", "Segoe UI", "Times New Roman"];

function Story({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="library-story" aria-label={title}>
      <h4 className="library-story-title">{title}</h4>
      <div className="library-story-body">{children}</div>
    </section>
  );
}

function Pane({ scheme }: { scheme: "light" | "dark" }) {
  const id = useId();
  const [style, setStyle] = useState("normal");
  const [font, setFont] = useState("Segoe UI");
  const [spacing, setSpacing] = useState("1.15");
  const [picked, setPicked] = useState("heading1");
  const [tab, setTab] = useState(0);
  const [check, setCheck] = useState(true);
  const [radio, setRadio] = useState("a");
  return (
    <section className="library-pane" data-scheme={scheme} aria-label={scheme === "light" ? "Light" : "Dark"}>
      <h3 className="group-title">{scheme === "light" ? "Light" : "Dark"}</h3>

      <Story title="Colour">
        <div className="library-swatches">
          {COLOURS.map((c) => (
            <div key={c} className="library-swatch" style={{ "--swatch": `var(--color-${c})` } as CSSProperties}>
              <span className="library-chip" />
              <code>{c}</code>
            </div>
          ))}
        </div>
      </Story>

      <Story title="Type">
        {TEXT.map((t) => (
          <p key={t} className="library-type" style={{ "--type": `var(--text-${t})` } as CSSProperties}>
            <code>{t}</code> The quick brown fox
          </p>
        ))}
      </Story>

      <Story title="Select · field">
        <label className="form-row">
          <span>Line spacing</span>
          <Select value={spacing} onValueChange={setSpacing}>
            <option value="1">Single</option>
            <option value="1.15">1.15</option>
            <option value="1.5">1.5 lines</option>
            <option value="2">Double</option>
            <option value="exact" disabled>
              Exactly (unavailable)
            </option>
          </Select>
        </label>
        <label className="form-row">
          <span>Disabled</span>
          <Select value="1" onValueChange={() => {}} disabled>
            <option value="1">Single</option>
          </Select>
        </label>
      </Story>

      <Story title="Select · toolbar">
        <div className="library-row">
          <Select variant="toolbar" width="style" aria-label="Paragraph style" value={style} onValueChange={setStyle}>
            <optgroup label="Text">
              <option value="normal">Normal text</option>
              <option value="quote">Quote</option>
            </optgroup>
            <optgroup label="Headings">
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
            </optgroup>
          </Select>
          <Select variant="toolbar" width="font" aria-label="Font" value={font} onValueChange={setFont}>
            {FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </div>
      </Story>

      <Story title="ListBox">
        <ListBox aria-label="Styles" rows={4} value={picked} onValueChange={setPicked}>
          <option value="normal">Normal text</option>
          <option value="heading1">Heading 1</option>
          <option value="heading2">Heading 2</option>
          <option value="title">Title</option>
          <option value="subtitle">Subtitle</option>
        </ListBox>
      </Story>

      <Story title="Buttons">
        <div className="library-row">
          <button type="button" className="btn primary">
            Apply
          </button>
          <button type="button" className="btn">
            Cancel
          </button>
          <button type="button" className="btn" disabled>
            Disabled
          </button>
          <button type="button" className="icon-btn" aria-label="Settings" title="Settings">
            <Settings16Regular />
          </button>
        </div>
      </Story>

      <Story title="Fields">
        <label className="form-row">
          <span>Name</span>
          <input className="field" defaultValue="Quarterly report" />
        </label>
        <label className="form-row">
          <span>Placeholder</span>
          <input className="field" placeholder="Search by name" />
        </label>
        <label className="form-row">
          <span>Invalid</span>
          <input className="field" aria-invalid="true" defaultValue="-3" />
        </label>
        <label className="form-row">
          <span>Disabled</span>
          <input className="field" disabled defaultValue="Locked" />
        </label>
      </Story>

      <Story title="Choices">
        <label className="check">
          <input type="checkbox" checked={check} onChange={(e) => setCheck(e.target.checked)} />
          Check spelling as you type
        </label>
        <div role="radiogroup" aria-label="Appearance" className="radio-row">
          {["a", "b", "c"].map((v, i) => (
            <label key={v} className="radio">
              <input type="radio" name={`${id}-radio`} checked={radio === v} onChange={() => setRadio(v)} />
              {["Light", "Dark", "System"][i]}
            </label>
          ))}
        </div>
      </Story>

      <Story title="Tabs">
        <div role="tablist" aria-label="Sample tabs" className="tabs">
          {["Indents and spacing", "Line and page breaks", "Tabs"].map((label, i) => (
            <button
              key={label}
              type="button"
              role="tab"
              id={`${id}-tab-${i}`}
              aria-selected={tab === i}
              aria-controls={`${id}-panel`}
              tabIndex={tab === i ? 0 : -1}
              className="tab"
              onClick={() => setTab(i)}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`} className="library-tabpanel muted">
          Panel {tab + 1}
        </div>
      </Story>
    </section>
  );
}

export function DesignLibrary() {
  return (
    <Dialog
      title="Design system"
      className="library-dialog"
      onClose={closeDialog}
      actions={
        <button type="button" className="btn" onClick={closeDialog}>
          Close
        </button>
      }
    >
      <div className="library-grid">
        <Pane scheme="light" />
        <Pane scheme="dark" />
      </div>
    </Dialog>
  );
}
