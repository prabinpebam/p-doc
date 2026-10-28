/** Toasts: short confirmations with at most one action, announced politely. */
import { Dismiss16Regular } from "@fluentui/react-icons";
import { app, dismissToast } from "../state.ts";

export function Toasts() {
  const toasts = app.use((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.tone === "error" ? " error" : ""}`}>
          <span className="toast-text">{t.text}</span>
          {t.action ? (
            <button
              type="button"
              className="btn subtle small"
              onClick={() => {
                dismissToast(t.id);
                t.action!.run();
              }}
            >
              {t.action.label}
            </button>
          ) : null}
          <button type="button" className="icon-btn tiny" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <Dismiss16Regular />
          </button>
        </div>
      ))}
    </div>
  );
}
