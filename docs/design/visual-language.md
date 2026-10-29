# P-Doc visual language

The layout of Word and Google Docs (menus, one toolbar, a page on a canvas, side panels), drawn with the restraint of a modern design tool such as Figma: neutral greys, hairline dividers, one blue accent, compact controls and quiet chrome that gets out of the way of the page.

## Decisions

- **Density.** P-Doc is a desktop app used with a mouse and keyboard, so controls are compact: 32 px buttons and fields, 28 px toolbar and menu rows, 13 px interface text. This deliberately departs from 44 px touch targets; every control still has a visible focus ring and a full keyboard path.
- **One row, one height.** Fields, selects and buttons all take `c.control.height`, so controls that share a row line up. A dense surface (the find bar) lowers that one token for everything inside it rather than resizing single controls. `e2e/alignment.spec.ts` checks every surface and dialog tab for it.
- **Two blues.** `color.accent` is for text and icons (links, the active outline item, pressed toolbar buttons). `color.accent-fill` is for filled surfaces (primary buttons, the highlighted menu item, the chosen option), always with `color.on-accent` text. The two don't mix, which is what keeps dark mode legible.
- **Highlight.** The item under the keyboard or pointer in a menu, a select or command search is filled with the accent, the way a design tool marks the current item; a selected-but-not-active row uses `color.selected`.
- **Surfaces.** In both themes there are three steps: `canvas` behind the page, `bg`/`bg-raised` for chrome and popups, and `field` for input wells. Fields are filled, not outlined; buttons are outlined, not filled (except primary).
- **Lines.** `color.divider` separates regions (toolbar, panels, dialog title and actions); `color.rule` outlines controls.
- **Dialogs.** The title and the actions stay put and only the body scrolls, never sideways. Group headings are small capitals in the muted colour.
- **Tabs.** A segmented control: every tab on one line, the chosen one raised.
- **Selects.** The app's own `Select` (a select-only combobox: a button with a list in the top layer), never the browser's `<select>`, so the list, its groups, the check on the chosen option and the scrollbar follow the tokens in every theme. Always-visible lists (the Styles list) use `ListBox`. Both take declarative `<option>` and `<optgroup>` children. A picker on the paper (the code language) stays light like the paper; its list follows the app.
- **Scrollbars.** Thin, without arrows or a track; the thumb darkens on hover.

## Components and tiers

The UI lives in `apps/desktop/src/renderer/ui/`, one folder per tier. A tier depends only on the tiers below it:

| Tier | Folder | What | Examples |
| --- | --- | --- | --- |
| 0 | `foundations/` | Pure models and contracts, no rendering | the list keyboard model (`listbox.ts`), option parsing, where focus goes home |
| 1 | `primitives/` | Sealed fundamentals: no `className` or `style` props, so they look the same everywhere | `Select`, `ListBox` |
| 2 | `components/` | Compounds built from fundamentals | `Dialog`, `Menu` |
| 3 | `patterns/` | Views and layouts: the toolbar, panels, dialogs, the design library | `Toolbar`, `ParagraphDialog`, `DesignLibrary` |

Tiers 0 to 2 never import app state (`session`, `state`, the editor); what they need is passed in or registered (the page's focus home). Every file in tiers 0 to 2 opens with a doc comment naming its `@tier`; fundamentals and components also say `@a11y` and their `@key`s. CSS for the fundamentals is in `styles/primitives.css`.

The **design library** (`Ctrl+Alt+Shift+D`, or "Design system" in command search) renders every fundamental and shared control from its source, in each state, light and dark side by side.

## Checking it

- `pnpm lint:design`: tokens only, hover rules only for pointers that hover, generated tokens up to date and contrast in both themes.
- `apps/desktop/test/ui-tiers.test.ts`: every UI file sits in a tier, imports only downwards, tiers 0 to 2 stay out of app state and carry their doc comments, primitives are sealed, and no view renders a browser `<select>`.
- `apps/desktop/test/listbox.test.ts`: the list keyboard model (steps, ends, paging, type-ahead, placement).
- `apps/desktop/e2e/visual-audit.spec.ts`: captures every main surface and dialog in light and dark into `PD_AUDIT_DIR` for a visual review.
