/**
 * Reads declarative `<option>` and `<optgroup>` children into the options a Select or ListBox shows, so
 * a list is written the way HTML writes one and rendered by the app's own components.
 * @tier 0
 */
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import type { ListOption } from "./listbox.ts";

const text = (n: ReactNode): string => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(text).join("");
  if (isValidElement<{ children?: ReactNode }>(n)) return text(n.props.children);
  return "";
};

export function optionsOf(children: ReactNode, group?: string, into: ListOption[] = []): ListOption[] {
  Children.forEach(children, (c) => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; label?: string; disabled?: boolean }>(c)) return;
    if (c.type === Fragment) optionsOf(c.props.children, group, into);
    else if (c.type === "optgroup") optionsOf(c.props.children, c.props.label, into);
    else if (c.type === "option") {
      const label = text(c.props.children);
      into.push({ value: String(c.props.value ?? label), label, disabled: c.props.disabled, group });
    }
  });
  return into;
}
