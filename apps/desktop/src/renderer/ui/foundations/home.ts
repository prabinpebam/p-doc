/**
 * Where the keyboard goes home to when a dialog or menu closes: the page. The app registers it once,
 * so components return focus to the page without depending on the editor.
 * @tier 0
 */
export interface FocusHome {
  /** Whether the element is part of the page (focus returns through the page, keeping the caret). */
  owns(el: Element): boolean;
  focus(): void;
}

let home: FocusHome | null = null;

export function setFocusHome(next: FocusHome | null): void {
  home = next;
}

export function focusHome(): FocusHome | null {
  return home;
}
