# P-Doc visual language

The layout of Word and Google Docs (menus, one toolbar, a page on a canvas, side panels), drawn with the restraint of a modern design tool such as Figma: neutral greys, hairline dividers, one blue accent, compact controls and quiet chrome that gets out of the way of the page.

## Decisions

- **Density.** P-Doc is a desktop app used with a mouse and keyboard, so controls are compact: 32 px buttons and fields, 28 px toolbar and menu rows, 13 px interface text. This deliberately departs from 44 px touch targets; every control still has a visible focus ring and a full keyboard path.
- **Two blues.** `color.accent` is for text and icons (links, the active outline item, pressed toolbar buttons). `color.accent-fill` is for filled surfaces (primary buttons, the highlighted menu item, the chosen option), always with `color.on-accent` text. The two don't mix, which is what keeps dark mode legible.
- **Highlight.** The item under the keyboard or pointer in a menu, a select or command search is filled with the accent, the way a design tool marks the current item; a selected-but-not-active row uses `color.selected`.
- **Surfaces.** In both themes there are three steps: `canvas` behind the page, `bg`/`bg-raised` for chrome and popups, and `field` for input wells. Fields are filled, not outlined; buttons are outlined, not filled (except primary).
- **Lines.** `color.divider` separates regions (toolbar, panels, dialog title and actions); `color.rule` outlines controls.
- **Dialogs.** The title and the actions stay put and only the body scrolls, never sideways. Group headings are small capitals in the muted colour.
- **Tabs.** A segmented control: every tab on one line, the chosen one raised.
- **Selects.** Native `<select>` elements, drawn with the customizable select (`appearance: base-select`) so the list is themed in light and dark and keeps native keyboard and accessibility behaviour. List boxes (`size` set) keep the classic list but use the same colours.
- **Scrollbars.** Thin, without arrows or a track; the thumb darkens on hover.

## Checking it

- `pnpm lint:design`: tokens only, hover rules only for pointers that hover, generated tokens up to date and contrast in both themes.
- `apps/desktop/e2e/visual-audit.spec.ts`: captures every main surface and dialog in light and dark into `PD_AUDIT_DIR` for a visual review.
