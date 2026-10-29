/** Format > Paragraph styles > Edit styles… (U41, V12): every style's properties, own styles and personal defaults. */
import { Select } from "../primitives/Select.tsx";
import { ListBox } from "../primitives/ListBox.tsx";
import { useState } from "react";
import { followingStyle, styleKeys, styleLabel, type StyleDef, type StyleKey, type Styles } from "@p-doc/core";
import { saveDefaultStyles, useDefaultStyles } from "../../commands.ts";
import { setDocumentStyles } from "../../editor/styles.ts";
import { getEditor } from "../../session.ts";
import { app, closeDialog } from "../../state.ts";
import { Dialog } from "../components/Dialog.tsx";
import { FONTS, TEXT_COLOURS } from "./Toolbar.tsx";

const PREVIEW = "The quick brown fox jumps over the lazy dog.";

function newKey(styles: Styles): StyleKey {
  let n = Date.now();
  while (styles[`custom-${n.toString(36)}`]) n++;
  return `custom-${n.toString(36)}`;
}

/** A number typed in a field: applied as soon as it's valid, so the page changes at once. */
function NumberField(p: { label: string; name: string; value: number; min: number; max: number; step?: number; disabled: boolean; onValue: (v: number) => void }) {
  const [text, setText] = useState(String(p.value));
  const n = Number(text);
  const bad = text.trim() === "" || !Number.isFinite(n) || n < p.min || n > p.max;
  return (
    <label className="form-row">
      <span>{p.label}</span>
      <input
        className="field"
        name={p.name}
        inputMode="decimal"
        value={text}
        disabled={p.disabled}
        aria-invalid={bad || undefined}
        onChange={(ev) => {
          setText(ev.target.value);
          const v = Number(ev.target.value);
          if (ev.target.value.trim() !== "" && Number.isFinite(v) && v >= p.min && v <= p.max) p.onValue(v);
        }}
      />
      {bad ? <span className="form-error">Enter a number from {p.min} to {p.max}.</span> : null}
    </label>
  );
}

export function StylesDialog() {
  const styles = app.use((s) => s.doc?.styles);
  const hasDefaults = app.use((s) => !!s.settings?.styleDefault);
  const editor = getEditor();
  const [selected, setSelected] = useState<StyleKey>("normal");
  const [creating, setCreating] = useState<{ name: string; from: StyleKey } | null>(null);
  if (!styles || !editor) return null;
  const editable = editor.isEditable;
  const key: StyleKey = styles[selected] ? selected : "normal";
  const s = styles[key];
  const custom = key.startsWith("custom-");
  const keys = styleKeys(styles);
  const set = (patch: Partial<StyleDef>) => setDocumentStyles(editor, { ...styles, [key]: { ...s, ...patch } });

  const nameTaken = (name: string) => keys.some((k) => styleLabel(k, styles).toLowerCase() === name.trim().toLowerCase());
  const createBad = !!creating && (!creating.name.trim() || nameTaken(creating.name));
  const create = () => {
    if (!creating || createBad) return;
    const k = newKey(styles);
    const from = styles[creating.from] ?? styles.normal;
    setDocumentStyles(editor, { ...styles, [k]: { ...structuredClone(from), name: creating.name.trim().slice(0, 100), next: k } });
    setCreating(null);
    setSelected(k);
  };
  const remove = () => {
    if (!custom) return;
    const next = Object.fromEntries(Object.entries(styles).filter(([k]) => k !== key)) as Styles;
    // Any style that was followed by this one is followed by Normal text instead.
    for (const k of Object.keys(next) as StyleKey[]) if (next[k].next === key) next[k] = { ...next[k], next: "normal" };
    setDocumentStyles(editor, next, key);
    setSelected("normal");
  };
  const font = FONTS.find(([, v]) => v === s.fontFamily)?.[0] ?? s.fontFamily.split(",")[0]!.replace(/['"]/g, "").trim();

  return (
    <Dialog
      title="Styles"
      wide
      className="styles-dialog"
      onClose={closeDialog}
      onSubmit={() => (creating ? create() : closeDialog())}
      actions={
        <>
          <button type="button" className="btn" disabled={!editable} onClick={() => void saveDefaultStyles()}>
            Save as my default styles
          </button>
          <button type="button" className="btn" disabled={!editable || !hasDefaults} onClick={useDefaultStyles}>
            Use my default styles
          </button>
          <button type="submit" className="btn primary">
            {creating ? "Create" : "Done"}
          </button>
        </>
      }
    >
      <div className="styles-layout">
        <div className="styles-list">
          <ListBox rows={Math.min(keys.length, 14)} aria-label="Styles" data-autofocus value={key} onValueChange={(v) => setSelected(v as StyleKey)}>
            {keys.map((k) => (
              <option key={k} value={k}>
                {styleLabel(k, styles)}
              </option>
            ))}
          </ListBox>
          <button type="button" className="btn" disabled={!editable || !!creating} onClick={() => setCreating({ name: "", from: key })}>
            New style…
          </button>
        </div>
        <div className="styles-props">
          {creating ? (
            <fieldset className="plain">
              <label className="form-row">
                <span>Name</span>
                <input className="field" name="style-new-name" autoFocus value={creating.name} aria-invalid={(!!creating.name.trim() && createBad) || undefined} onChange={(ev) => setCreating({ ...creating, name: ev.target.value })} />
              </label>
              {creating.name.trim() && createBad ? <p className="form-error">A style with this name already exists.</p> : null}
              <label className="form-row">
                <span>Start from</span>
                <Select name="style-new-from" value={creating.from} onValueChange={(ev) => setCreating({ ...creating, from: ev as StyleKey })}>
                  {keys.map((k) => (
                    <option key={k} value={k}>
                      {styleLabel(k, styles)}
                    </option>
                  ))}
                </Select>
              </label>
              <button type="button" className="btn" onClick={() => setCreating(null)}>
                Cancel new style
              </button>
            </fieldset>
          ) : (
            <fieldset className="plain" disabled={!editable} key={key}>
              <p className="styles-preview" aria-label="Preview" style={{ fontFamily: s.fontFamily, fontSize: `${Math.min(s.fontSize, 28)}pt`, fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? "italic" : "normal", fontVariantCaps: s.smallCaps ? "small-caps" : "normal", color: s.color || undefined }}>
                {PREVIEW}
              </p>
              {custom ? (
                <div className="form-grid wide-first">
                  <StyleNameField key={`name-${key}`} value={styleLabel(key, styles)} taken={(n) => n.trim().toLowerCase() !== styleLabel(key, styles).toLowerCase() && nameTaken(n)} onValue={(name) => set({ name })} />
                  <button type="button" className="btn styles-delete" onClick={remove}>
                    Delete style
                  </button>
                </div>
              ) : null}
              <div className="form-grid wide-first">
                <label className="form-row">
                  <span>Font</span>
                  <Select name="style-font" value={font} onValueChange={(ev) => set({ fontFamily: FONTS.find(([n]) => n === ev)?.[1] ?? s.fontFamily })}>
                    {FONTS.some(([n]) => n === font) ? null : <option value={font}>{font}</option>}
                    {FONTS.map(([n]) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </label>
                <NumberField label="Size (pt)" name="style-size" value={s.fontSize} min={1} max={400} disabled={!editable} onValue={(fontSize) => set({ fontSize })} />
              </div>
              <div className="form-grid">
                <label className="form-row">
                  <span>Colour</span>
                  <Select name="style-colour" value={s.color} onValueChange={(ev) => set({ color: ev })}>
                    <option value="">Automatic</option>
                    {TEXT_COLOURS.some(([, v]) => v === s.color) || !s.color ? null : <option value={s.color}>{s.color}</option>}
                    {TEXT_COLOURS.map(([n, v]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </label>
                <div className="styles-checks">
                  <label className="check">
                    <input type="checkbox" name="style-bold" checked={s.bold} onChange={(ev) => set({ bold: ev.target.checked })} />
                    Bold
                  </label>
                  <label className="check">
                    <input type="checkbox" name="style-italic" checked={s.italic} onChange={(ev) => set({ italic: ev.target.checked })} />
                    Italic
                  </label>
                  <label className="check">
                    <input type="checkbox" name="style-small-caps" checked={!!s.smallCaps} onChange={(ev) => set({ smallCaps: ev.target.checked })} />
                    Small caps
                  </label>
                </div>
              </div>
              <div className="form-grid">
                <NumberField label="Space before (pt)" name="style-before" value={s.spaceBefore} min={0} max={400} disabled={!editable} onValue={(spaceBefore) => set({ spaceBefore })} />
                <NumberField label="Space after (pt)" name="style-after" value={s.spaceAfter} min={0} max={400} disabled={!editable} onValue={(spaceAfter) => set({ spaceAfter })} />
                <NumberField label="Line spacing" name="style-line" value={s.lineHeight} min={0.5} max={10} disabled={!editable} onValue={(lineHeight) => set({ lineHeight })} />
                <NumberField label="Indent (in)" name="style-indent" value={(s.indent ?? 0) / 2} min={0} max={4} disabled={!editable} onValue={(v) => set({ indent: v * 2 })} />
              </div>
              <label className="form-row">
                <span>Style for the following paragraph</span>
                <Select name="style-next" value={followingStyle(key, styles)} onValueChange={(ev) => set({ next: ev as StyleKey })}>
                  {keys.filter((k) => k !== "code").map((k) => (
                    <option key={k} value={k}>
                      {styleLabel(k, styles)}
                    </option>
                  ))}
                </Select>
              </label>
            </fieldset>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** An own style's name, applied when it's valid and not another style's name. */
function StyleNameField(p: { value: string; taken: (name: string) => boolean; onValue: (name: string) => void }) {
  const [text, setText] = useState(p.value);
  const bad = !text.trim() || p.taken(text);
  return (
    <label className="form-row">
      <span>Name</span>
      <input
        className="field"
        name="style-name"
        value={text}
        aria-invalid={bad || undefined}
        onChange={(ev) => {
          setText(ev.target.value);
          if (ev.target.value.trim() && !p.taken(ev.target.value)) p.onValue(ev.target.value.trim().slice(0, 100));
        }}
      />
      {bad ? <span className="form-error">{text.trim() ? "A style with this name already exists." : "Enter a name."}</span> : null}
    </label>
  );
}
