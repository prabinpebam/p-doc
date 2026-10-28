/** Insert > Equation (Alt+=, U62, spec §4.14 step 5): LaTeX with the maths drawn beside it as you type. */
import { useMemo, useState } from "react";
import { mathml } from "@p-doc/core";
import { applyEquation, equationAt } from "../editor/equations.ts";
import { getEditor } from "../session.ts";
import { closeDialog } from "../state.ts";
import { Dialog } from "./Dialog.tsx";

export function EquationDialog() {
  const e = getEditor();
  const [target] = useState(() => (e ? equationAt(e.state) : null));
  const [latex, setLatex] = useState(target?.latex ?? "");
  const drawn = useMemo(() => (latex.trim() ? mathml(latex, target?.display) : null), [latex, target?.display]);
  if (!e || !target) return null;
  const error = drawn?.error ?? null;
  const apply = () => {
    // A mistake keeps the dialog open with the source as typed.
    if (error) return;
    closeDialog();
    applyEquation(e, target, latex.trim());
  };
  return (
    <Dialog
      title="Equation"
      onClose={closeDialog}
      onSubmit={apply}
      actions={
        <>
          <span className="fill" />
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!!error}>
            {target.pos >= 0 ? "Apply" : "Insert"}
          </button>
        </>
      }
    >
      <label className="form-row">
        <span>LaTeX</span>
        <input
          className="field mono"
          data-autofocus
          spellCheck={false}
          placeholder="\frac{a}{b}"
          value={latex}
          aria-invalid={!!error}
          aria-describedby={error ? "equation-error" : undefined}
          onChange={(ev) => setLatex(ev.target.value)}
        />
      </label>
      <div className={`equation-preview${target.display ? " is-display" : ""}`} data-testid="equation-preview" aria-live="polite">
        {drawn?.html ? <span dangerouslySetInnerHTML={{ __html: drawn.html }} /> : <span className="muted">{error ? "" : "The equation shows here as you type."}</span>}
      </div>
      {error ? (
        <p id="equation-error" className="form-error" role="alert">
          Can't read this: {error}
        </p>
      ) : null}
    </Dialog>
  );
}
