/**
 * Modal dialogs on the native <dialog> (focus trap, Esc, inert page), returning focus on close. The
 * control to start in carries `data-autofocus`; without one, the first control gets the keyboard.
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { getEditor } from "../session.ts";

export interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
  className?: string;
  /** Submit runs on Enter in a field (the primary action). */
  onSubmit?: () => void;
}

export function Dialog({ title, onClose, children, actions, wide, className, onSubmit }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const d = ref.current!;
    if (!d.open) d.showModal();
    // React's autoFocus runs while the dialog is still closed, so the field to start in is marked instead.
    d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      if (d.open) d.close();
      // Never back to the menu bar a command was picked from: the page takes the keyboard again.
      const inMenu = (el: Element | null) => !!el?.closest('[role="menubar"], [role="menu"]');
      const view = getEditor()?.view;
      // The page through its editor, which puts the caret back where it was (a plain focus puts it at the start).
      if (view && back && view.dom.contains(back)) view.focus();
      else if (back?.isConnected && back !== document.body && !inMenu(back)) back.focus();
      else {
        const a = document.activeElement;
        if (!a || a === document.body || d.contains(a) || inMenu(a)) getEditor()?.view.focus();
      }
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? " wide" : ""} ${className ?? ""}`}
      aria-labelledby={`${id}-title`}
      onKeyDown={(e) => {
        // One Esc closes, even from a search field (where Chromium would only clear the text).
        if (e.key !== "Escape" || e.defaultPrevented) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        <h2 id={`${id}-title`} className="dialog-title">
          {title}
        </h2>
        <div className="dialog-body">{children}</div>
        {actions ? <div className="dialog-actions">{actions}</div> : null}
      </form>
    </dialog>
  );
}
