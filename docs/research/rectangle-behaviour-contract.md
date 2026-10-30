# Rectangle behaviour contract

Status: draft contract, 2026-10-30. Docs only; no implementation is authorised by this file. Traces to P1/P3/P4 → J3/J15 → U114, U114.P1–P3 and flows DP1–DP4 in [spec](../product/spec.md) ("Rectangle document placement addendum").

**Process.** Every feature first gets a complete behaviour matrix like this one, so nothing about the UI, interaction, functionality or behaviour is missed. The order is fixed: (1) **contract**: this file, every row with a source and a test ID; (2) **independent completeness critic**: a separate agent reads this contract against the spec, the references and the prototype, and adds missing rows or flags weak ones before any build; (3) **build and test 1:1**: each in-scope row gets exactly one automated test with the row's test ID (`T-<suffix>`), and the build is only "done" when every in-scope test passes; (4) **adversarial review**: a reviewer tries to break the build against the contract (modifier combinations, Mixed, clamping, undo, keyboard-only) and an independent visual check runs; (5) **owner**: only then does the owner see it. Out-of-scope rows are listed on purpose with a reason; nothing may be silently absent.

## Precedence

1. Owner decisions in the spec: the placement addendum and radius correction (13:15, 13:29), the permanent number-field rule (14:29) and the review decisions (14:29), plus the owner decisions restated in this assignment (14:34).
2. Microsoft Word, for **document placement and text flow** (wrap, anchor, references, inline-as-character).
3. Figma, for **shape editing, the pane and the canvas** (handles, rotate, radius, fields, fill and stroke, arrange).
4. Decisions this contract takes where none of the above says anything (marked **CD** = contract decision, each with its reason, for the critic to challenge).

## Source key

| Key | Source (retrieved 2026-10-30 unless marked) |
| --- | --- |
| F-ARPD | [Figma: Adjust alignment, rotation, position, and dimensions](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions): alignment, snap settings, X/Y, nudge 1/10, dimensions and blue label, resize handles, lock aspect ratio (Shift temporarily locks, Ctrl temporarily unlocks), rotation (± 180, wraps, Shift snaps 15°), flip Shift+H / Shift+V, layer order shortcuts and right-click menu, equations (`+ - * / ^ ( )`, `Mixed+100`), scrub fields |
| F-CR | [Figma: Adjust corner radius and smoothing](https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing): Corner radius field, canvas radius handles, Alt for one corner, Independent corners, nudge keys apply to radius, corner smoothing |
| F-SEL | [Figma: Select layers and objects](https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects): click, Shift+click add/remove, marquee, Enter/double-click one level down, right-click "Select layer" |
| F-PANEL | [Figma: Design, prototype, and explore layer properties in the right sidebar](https://help.figma.com/hc/en-us/articles/360039832014): Design tab sections |
| F-FILL | [Figma: Guide to fills](https://help.figma.com/hc/en-us/articles/360041003694-Guide-to-fills): add (+), remove (−), eye to hide, fill opacity, drag to reorder, fill types |
| F-STROKE | [Figma: Apply and adjust stroke properties](https://help.figma.com/hc/en-us/articles/360049283914-Apply-and-adjust-stroke-properties): add stroke, inside/center/outside (inside default for shapes), weight not in dimensions, individual strokes, width profiles |
| F-PICK | [Figma: Update fills using the color picker](https://help.figma.com/hc/en-us/articles/360041003774-Apply-paints-with-the-color-picker): swatch opens picker, hue/opacity sliders, HEX/RGB/HSL models, eyedropper, blend mode |
| F-SHAPE | [Figma: Shape tools](https://help.figma.com/hc/en-us/articles/360040450133-Shape-tools): Alt resizes from the centre; Shift+Alt does both (verified by the critic) |
| F-SMS | [Figma: Arrange layers with Smart selection](https://help.figma.com/hc/en-us/articles/360040450233-Arrange-layers-with-Smart-selection): Ctrl+D = **Duplicate Selection in Place**; deleting layers (verified by the critic) |
| F-KBD | [Use Figma products with a keyboard](https://help.figma.com/hc/en-us/articles/360040328653-Use-Figma-products-with-a-keyboard) (fetched 15:16): arrow keys pan with nothing selected, keyboard box selection, shortcuts panel. It does **not** list Delete/Backspace or say how shortcuts behave while a text field has focus, so rows that relied on it (RC-CAN-24, RC-KB-20) are contract decisions. |
| F-THEME | [Figma: Change themes in Figma](https://help.figma.com/hc/en-us/articles/5576781786647-Change-the-theme-of-Figma) (fetched 15:16): the theme changes the appearance of the Figma **interface**, is device-specific and does not change what others see in the same file; enhanced contrast mode raises contrast of UI text, buttons, outlines and selections |
| W-KBD | [Word: Keyboard shortcuts in Word](https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-word-95ef89dd-7142-4b50-afb2-f762f663ceb2) (fetched 15:16): arrow keys move the cursor; "Select text: Shift+Arrow keys" |
| W-INS | [Word: Insert pictures](https://support.microsoft.com/en-us/word/training/insert-pictures) (fetched 15:17): insert from the Insert tab; resize by a corner handle; pick a wrap other than In Line with Text to move it freely. It does not say what happens to selected text. |
| W-PAGE | [Word: Add, change, or delete the background color in Word](https://support.microsoft.com/en-us/word/add-change-or-delete-the-background-color-in-word) (fetched 15:26): page colour is set with Design > Page Color and removed with No Color; it is a document setting. The page says nothing about dark mode. |
| W-LO | [Word: Layout options](https://support.microsoft.com/en-us/word/layout-options): Position (Horizontal: Page, Margin, Column, Character; Vertical: Page, Margin, Paragraph, Line; alignment, absolute position), Move object with text, Lock anchor, Allow overlap with Bring Forward / Send Backward; Text Wrapping section (In line, Square, Tight, Top and Bottom, Behind, In Front, distances) as already recorded in the spec |
| W-WRAP | [Word: Wrap text around a picture](https://support.microsoft.com/en-us/word/training/wrap-text-around-a-picture-in-word): In Line with Text behaves as text and moves as text is added; other choices move freely with text flowing around |
| W-UNDO | [Word: Undo, redo, or repeat an action](https://support.microsoft.com/en-us/office/undo-redo-or-repeat-an-action-84bdb9bc-4e23-4f06-ba78-f7b893eb2d28): Ctrl+Z undoes, Ctrl+Y (also F4) redoes or repeats, undo works after saving, 100-action default (verified by the critic). Ctrl+Shift+Z is a contract choice. |
| OD-INL | Owner: inline is the default on insert; inline shapes have no X/Y and no alignment (spec DP1, 14:34) |
| OD-LBL | Owner 14:29: no W × H or Radius labels on the canvas; values only in the pane (supersedes "Show live Radius N" of 13:29) |
| OD-DES | Owner 14:29: clicking outside the page (canvas or margins) deselects |
| OD-RAD | Owner 13:29 radius correction: arrow cursor always, dot grows/fills on hover/focus, radial projection on the corner diagonal, clamp 0…half the shorter side, all four together, Alt one, Esc restores, keys 10 / Shift 100, Home/End |
| OD-NUM | Owner 14:29 permanent number-field rule: scrub on every number field from the field itself, Pointer Lock hides the cursor and returns it to the start, click to type, Enter applies, Esc reverts, Up/Down 1, Shift 10, clamp, units kept, Mixed, one shared component, one automated test per field |
| OD-ROT | Owner 14:29: rotated shapes wrap around their axis-aligned rotated bounding box plus the distances |
| SPEC-DP1…DP4 | Spec flows DP1–DP4 (insert inline, float and wrap, position and anchor, arrange two rectangles) |
| SS-PANE | Owner screenshot 1: Figma Design pane for a Rectangle: Position (Alignment ×6, X, Y, Rotation, rotate 90, flip H, flip V), Layout (W, H, lock), Appearance (Opacity, Corner radius, independent corners, eye, blend), Fill (swatch, hex, 100 %, eye, −), Stroke +, Effects +, Export + |
| SS-RAD | Owner screenshot 2: four white radius dots inset on the diagonals; Figma shows "Radius 192" and "1450 × 1740" badges (badges overridden by OD-LBL) |
| PROTO | Today's prototype `rectangle-preview.html` (session 4b71e8bf): read for what exists; not evidence of parity |

## Contract decisions to challenge (CD)

| CD | Decision | Reason |
| --- | --- | --- |
| CD-01 | Rotation sign follows Figma (positive = counter-clockwise), range (−180, 180], values past ±180 wrap instead of clamping. | Pane is Figma's (F-ARPD); wrap is how a rotation field "clamps". |
| CD-02 | Mixed + arrow/scrub adds the step to **each** value (each clamped), like Figma's `Mixed+100`; typing a plain number sets all to it. | F-ARPD equations; OD-NUM says the change applies to all values Mixed stands for. Today's prototype instead sets all four corners to max+1/min−1; that is a gap. |
| CD-03 | Field ranges: X/Y −10 000…10 000; W/H 1…10 000; rotation (−180, 180]; opacity and fill/stroke opacity 0…100 %; radius and each corner 0…⌊min(W,H)/2⌋; stroke weight 0…100; wrap distances 0…200. Units: px, °, %. | OD-NUM needs a min and max per field; numbers are generous so no real document hits them. |
| CD-04 | Marquee selection is out; a drag on the page selects text as in Word. | A document page is text first; no free canvas to marquee on. |
| CD-05 | Multi-select (Shift+click) is in for **floating** rectangles only; no combined resize/rotate/radius handles on a multi-selection; pane edits, nudge, Delete, Ctrl+D and arrange apply to each. | F-SEL; makes Mixed honest for X/Y/W/H; combined-bounds transforms are a separate slice. |
| CD-06 | Snapping and smart guides are out of this slice. | Not in DP1–DP4; needs agreed targets (margins, columns, paragraphs) and its own matrix. |
| CD-07 | One fill and one stroke per rectangle; reorder is out; "+" is shown only when the slot is empty. | Word shapes have one fill and one line; reordering one item is meaningless. |
| CD-08 | Default on insert: inline, 0° rotation, 200 × 120 px, fill = the design-system shape fill token's light-theme value stored as a fixed colour (RC-KB-21), fill opacity 100 %, no stroke, radius 0, opacity 100 %. | OD-INL; SS-PANE shows a solid fill and no stroke; a stored colour keeps a document the same on every computer and theme. |
| CD-09 | Figma's Alt+A/D/H/W/S/V alignment shortcuts are out. | P-Doc has a menu bar; Alt+letter is its access-key space. |
| CD-10 | Scrub: Shift multiplies the scrub delta by 10; Alt has no scrub effect. | Matches the 1/10 key steps of OD-NUM; Figma's scrub speeds are out. |
| CD-11 | Enter on a selected rectangle, or a double-click, starts editing its text; Esc leaves text editing and keeps the rectangle selected; a second Esc deselects. | F-SEL (Enter / double-click go one level down); U114 native paragraphs. |
| CD-12 | Radius dots are hidden when either on-screen side is under 32 px; the pane fields stay available. | Keeps resize handles grabbable; the pane is the fallback. |
| CD-13 | Ctrl+drag behaves as a plain drag (no copy, no snap toggle). | Word copies on Ctrl+drag and Figma disables snapping; neither is wanted with snapping out and Ctrl+D present. |
| CD-14 | Keyboard-only move of an inline rectangle within the text waits for the clipboard slice (RC-OS-25): no new move command is invented; the limit is recorded as RC-OS-40 with its follow-up. | Word moves inline objects by keyboard with cut and paste (W-KBD); inventing a P-Doc-only command would diverge from Word for text flow (precedence 2). Accepted limit for this slice (WCAG 2.1.1), owner to see it named. |

## 1. Pointer: cursors

| ID | Control/element | Input/state | Expected behaviour | Source | Test ID | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| RC-PTR-01 | Unselected rectangle body (inline or floating, not behind text) | hover | Default arrow cursor; hover outline shows (RC-SEL-08). | F-SEL; CD | T-PTR-01 | in |
| RC-PTR-02 | Selected floating rectangle body | hover | Move cursor (four arrows). | F-ARPD; PROTO | T-PTR-02 | in |
| RC-PTR-03 | Selected inline rectangle body | hover | Move cursor; dragging moves it as a character (RC-WP-05). | W-WRAP; OD-INL | T-PTR-03 | in |
| RC-PTR-04 | Any rectangle body | during move drag | Move cursor kept for the whole drag, even outside the page. | F-ARPD | T-PTR-04 | in |
| RC-PTR-05 | Top-left / bottom-right handles (0°) | hover and drag | `nwse-resize`. | F-ARPD | T-PTR-05 | in |
| RC-PTR-06 | Top-right / bottom-left handles (0°) | hover and drag | `nesw-resize`. | F-ARPD | T-PTR-06 | in |
| RC-PTR-07 | Top / bottom edge handles (0°) | hover and drag | `ns-resize`. | F-ARPD | T-PTR-07 | in |
| RC-PTR-08 | Left / right edge handles (0°) | hover and drag | `ew-resize`. | F-ARPD | T-PTR-08 | in |
| RC-PTR-09 | Resize handles on a rotated rectangle | hover and drag | Cursor is the resize cursor nearest to the handle's rotated direction (snapped to 45° steps). | CD (source does not state it; critic phase 2) | T-PTR-09 | in |
| RC-PTR-10 | Rotation zone just outside each corner | hover and drag | Rotate cursor (custom curved-arrow cursor asset), kept during the drag. | F-ARPD "Hover just outside one of the layer's bounds" | T-PTR-10 | in |
| RC-PTR-11 | Radius dot | rest, hover, focus, drag | Default **arrow** always; never a curved or resize cursor. | OD-RAD; SS-RAD | T-PTR-11 | in |
| RC-PTR-12 | Text inside a rectangle in text-editing mode | hover | I-beam. | CD-11 | T-PTR-12 | in |
| RC-PTR-13 | Page text area (no rectangle) | hover | I-beam (existing editor). | W-WRAP | T-PTR-13 | in |
| RC-PTR-14 | Page margins and grey canvas | hover | Default arrow. | OD-DES | T-PTR-14 | in |
| RC-PTR-15 | Pane number field, not focused (field body, label or icon) | hover | `ew-resize`, signalling scrub. | OD-NUM; F-ARPD scrub cursor | T-PTR-15 | in |
| RC-PTR-16 | Pane number field, focused for typing | hover | I-beam. | OD-NUM | T-PTR-16 | in |
| RC-PTR-17 | Pane number field | during scrub | Cursor hidden (Pointer Lock); on release it reappears exactly where the drag started. | OD-NUM | T-PTR-17 | in |
| RC-PTR-18 | Pane buttons, toggles, selects, swatches | hover | Default arrow (desktop app UI, as Figma). | CD (desktop-app convention: pane controls are not links, so no hand cursor; the [F-PANEL page](https://help.figma.com/hc/en-us/articles/360039832014) fetched 15:16 does not state cursors) | T-PTR-18 | in |
| RC-PTR-19 | Disabled pane control | hover | Default arrow; no hover fill; tooltip still explains why. | CD | T-PTR-19 | in |
| RC-PTR-20 | Anchor marker | hover | Default arrow; tooltip "Anchored to paragraph N". | SPEC-DP3; PROTO | T-PTR-20 | in |
| RC-PTR-21 | Behind-text rectangle under text | hover over text | I-beam (text wins); the rectangle is selected from Document objects. | W-LO; SPEC-DP4 | T-PTR-21 | in |

## 2. Pointer: clicks and drags

| ID | Control/element | Input/state | Expected behaviour | Source | Test ID | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| RC-CLK-01 | Rectangle body | click | Selects it; pane shows its values; caret leaves the text. | F-SEL | T-CLK-01 | in |
| RC-CLK-02 | Selected rectangle body | click again (no drag) | Stays selected; no change; no undo entry. | F-SEL | T-CLK-02 | in |
| RC-CLK-03 | Rectangle body | double-click | Selects and enters text editing with the caret at the click point. | CD-11; F-SEL | T-CLK-03 | in |
| RC-CLK-04 | Resize handle / rotation zone / radius dot | double-click | No action; no undo entry. | CD | T-CLK-04 | in |
| RC-CLK-05 | Rectangle body | right-click | Selects it (if not selected) and opens its context menu: Edit text, Duplicate (Ctrl+D), Delete, Flip horizontal (Shift+H), Flip vertical (Shift+V), Bring to front, Bring forward, Send backward, Send to back (arrange items only for floating; boundary items disabled). **No Cut, Copy or Paste items** in this slice: they are not rendered (not shown disabled) because rectangle clipboard is out of scope (RC-OS-25); they are added with the clipboard slice. | F-ARPD right-click menu (arrange, flip); SPEC-DP4; RC-OS-25; blind review 12d F7 | T-CLK-05 | in |
| RC-CLK-06 | Context menu | Esc or click elsewhere | Closes; selection unchanged. | CD | T-CLK-06 | in |
| RC-CLK-07 | Page text area while a rectangle is selected | click | Deselects; caret placed at the click (normal text behaviour). | W-WRAP; OD-DES | T-CLK-07 | in |
| RC-CLK-08 | Page margins while selected | click | Deselects; text selection not changed. | OD-DES | T-CLK-08 | in |
| RC-CLK-09 | Grey canvas outside the page while selected | click | Deselects. | OD-DES | T-CLK-09 | in |
| RC-CLK-10 | Pane background (no control) while selected | click | Keeps the selection; commits a focused field (blur). | F-PANEL; CD | T-CLK-10 | in |
| RC-CLK-11 | Page text / canvas | right-click while selected | Deselects; text context menu (on text) or none (canvas). | CD | T-CLK-11 | in |
| RC-CLK-12 | Floating body | drag | Moves freely; X/Y update live in the pane; text reflows live; one undo step on release. | F-ARPD; W-LO | T-CLK-12 | in |
| RC-CLK-13 | Floating body | Shift+drag | Movement locks to the dominant axis (horizontal or vertical) from the start point. | CD (source does not state it; critic phase 2) | T-CLK-13 | in |
| RC-CLK-14 | Floating body | Alt+drag | Same as plain drag (no duplicate). | RC-OS-02 | T-CLK-14 | in |
| RC-CLK-15 | Floating body | Ctrl+drag | Same as plain drag. | CD-13 | T-CLK-15 | in |
| RC-CLK-16 | Inline body | drag (any modifier) | Moves as a character: insertion caret shows at the nearest character boundary; drop inserts there; modifiers have no effect. | W-WRAP; SPEC-DP1 | T-CLK-16 | in |
| RC-CLK-17 | Any drag (move, resize, rotate, radius, inline) | Esc during the drag | Cancels: everything returns to the pre-drag state; no undo entry. | OD-RAD (Esc restores); CD | T-CLK-17 | in |
| RC-CLK-18 | Any drag | drag released outside the window | Commits at the last position (pointer capture). | CD | T-CLK-18 | in |
| RC-CLK-19 | Mouse down then up within 3 px | on body | Treated as a click, not a move; no undo entry. | CD | T-CLK-19 | in |
| RC-CLK-20 | Corner handle | drag | Free resize from the opposite corner. | F-ARPD | T-CLK-20 | in |
| RC-CLK-21 | Corner handle | Shift+drag (aspect unlocked) | Keeps aspect ratio while held. | F-ARPD | T-CLK-21 | in |
| RC-CLK-22 | Corner/edge handle | Alt+drag | Resizes symmetrically about the centre. | F-SHAPE; PROTO | T-CLK-22 | in |
| RC-CLK-23 | Corner handle | Shift+Alt+drag | Keeps ratio and resizes about the centre. | F-SHAPE | T-CLK-23 | in |
| RC-CLK-24 | Any handle with aspect locked | Ctrl+drag | Temporarily unlocks the ratio while held. | F-ARPD | T-CLK-24 | in |
| RC-CLK-25 | Edge handle | drag | Changes one dimension only; opposite edge fixed. | F-ARPD | T-CLK-25 | in |
| RC-CLK-26 | Edge handle | Shift+drag | Keeps ratio: the other dimension changes about its centre line. | F-ARPD (Shift locks ratio) + CD (other side grows about its centre line) | T-CLK-26 | in |
| RC-CLK-27 | Any handle | drag past the opposite edge | Flips on that axis as the handle crosses the opposite edge (horizontal for left/right, vertical for top/bottom, both for a corner crossing both) and keeps resizing from the now-fixed edge; W/H stay positive and never go below 1 px (CD-03); the flip state toggles exactly as Flip horizontal / vertical (RC-CAN-32/33, text stays readable); crossing back unflips; the whole drag is one undo step (RC-UR-07). | **CD** (source does not state it): Figma and Word both flip a shape dragged through its opposite edge in use (blind review a12 F1), but no fetched page documents it: the F-ARPD page (re-fetched 15:08) documents flip only via Shift+H/V and the menu, and the [Word move/rotate help page](https://support.microsoft.com/en-us/office/move-rotate-or-group-a-picture-text-box-or-other-object-in-office-4f9df3cb-b2fe-4ec7-8b7e-d6ea2f58d1b4) **could not be fetched** (error page, 15:08). Reason: matches what both reference products do and keeps W/H positive. | T-CLK-27 | in |
| RC-CLK-28 | Rotation zone | drag | Rotates about the centre; rotation field updates live. | F-ARPD | T-CLK-28 | in |
| RC-CLK-29 | Rotation zone | Shift+drag | Snaps to 15° steps. | F-ARPD | T-CLK-29 | in |
| RC-CLK-30 | Rotation zone | Alt or Ctrl+drag | Same as plain rotate (rotation origin is out, RC-OS-04). | CD | T-CLK-30 | in |
| RC-CLK-31 | Radius dot | drag | Radial projection on that corner's inward diagonal: inward increases, outward decreases; all four corners change together; clamp 0…half shorter side (⌊min(W,H)/2⌋); the value is rounded to a **whole number** of px at every step of the drag (never e.g. 141.42); typed values may keep up to 2 decimals. | OD-RAD; F-CR; SS-RAD ("Radius 192"); blind review a12 F2 | T-CLK-31 | in |
| RC-CLK-32 | Radius dot | Alt+drag | Only the dragged corner changes, to a whole number of px (as RC-CLK-31); the other three are kept; pane shows Mixed in Corner radius. | OD-RAD; F-CR; SS-RAD; blind review a12 F2 | T-CLK-32 | in |
| RC-CLK-33 | Radius dot | Shift or Ctrl+drag | Same as plain radius drag. | CD | T-CLK-33 | in |
| RC-CLK-34 | Page / canvas | press and drag on empty canvas or text | No marquee; text selection on the page, nothing on the canvas. | CD-04 | T-CLK-34 | in |
| RC-CLK-35 | Pane number field | click and drag | Scrubs (see RC-NF-*). | OD-NUM | T-CLK-35 | in |
| RC-CLK-36 | Radius dots and resize handles | rectangle rotated and/or flipped | Dots and handles sit on the transformed (on-screen) shape; a radius drag projects onto that dot's on-screen diagonal (inward increases, as RC-CLK-31); a resize keeps the opposite on-screen handle fixed (RC-CAN-12) with the cursor from the handle's on-screen direction (RC-PTR-09). Corner names (dot accessible names, TL/TR/BL/BR fields) always mean the rectangle's **own** corners in its untransformed frame: rotation and flip are transforms of the whole shape and **never rename corners or swap stored radii**, so after Flip horizontal at 0° the field named "Top-left" edits the corner now drawn at the top right, exactly as after a 180° rotation it edits the corner drawn at the bottom right. Flipping changes no radius value and is one undo step (RC-UR-09). Alt+drag changes the dragged dot's corner and that corner's field. | [F-ARPD](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions) (fetched 15:27: "Another way to replicate rotating layers is to use the Flip horizontal and Flip vertical transformations"; "Figma uses the matrix CSS transform property for flip transformations", so a flip is a transform like rotation and the layer's own properties are not rewritten); [FigJam: Resize, rotate, and flip objects](https://help.figma.com/hc/en-us/articles/1500006206242-Resize-rotate-and-flip-objects-in-FigJam) (fetched 15:27: flip mirrors the object over its axis); [F-CR](https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing) (fetched 15:26: documents dots and fields only for an unrotated layer). Reason, the same for rotation and flip: names belong to the shape, not the screen, so a transform never changes which field edits which corner and never rewrites stored values. | T-CLK-36 | in |
| RC-CLK-37 | Resize handle, rotation zone, radius dot, anchor marker | right-click; middle-click; wheel or Ctrl+wheel during a drag; a second button pressed mid-drag | Right-click (not during a drag) opens the rectangle context menu (RC-CLK-05) without changing geometry or selection; right-click on the anchor marker does the same. Middle-click does nothing (no undo step). During a drag the wheel scrolls and Ctrl+wheel zooms as it does elsewhere, and the drag continues with the shape following the pointer's new document position. A second button pressed mid-drag is ignored; the drag ends only on release of the button that started it (or Esc, RC-CLK-17). | [F-SEL](https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects) (fetched 15:16: "Right-click to open the context menu"); **CD** for middle-click, wheel and second-button handling (no source states them; reason: no accidental geometry change and drags never break when the view moves) | T-CLK-37 | in |

## 3. Selection

| ID | Control/element | Input/state | Expected behaviour | Source | Test ID | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| RC-SEL-01 | Insert rectangle | Insert command | Inserted **inline** at the caret, selected, pane shows Inline as the wrap mode; no X/Y or alignment shown. | OD-INL; SPEC-DP1 | T-SEL-01 | in |
| RC-SEL-02 | Selected floating rectangle | chrome | 1 px accent outline on the rotated bounds, 8 square resize handles, 4 radius dots (RC-SEL-09), invisible rotation zones outside the corners, anchor marker beside the anchored paragraph. | F-ARPD; SS-PANE; SS-RAD; SPEC-DP3 | T-SEL-02 | in |
| RC-SEL-03 | Selected inline rectangle | chrome | Same outline, 8 resize handles, 4 radius dots and rotation zones; **no** anchor marker (it is a character). | OD-INL; W-WRAP | T-SEL-03 | in |
| RC-SEL-04 | Selected rectangle | on-canvas labels | No W × H, Radius, X/Y or angle badge at any time. | OD-LBL | T-SEL-04 | in |
| RC-SEL-05 | Deselect | Esc (not in a field, not in text editing) | Deselects; caret placed right after an inline rectangle or at the start of a floating rectangle's anchor paragraph. | CD-11 | T-SEL-05 | in |
| RC-SEL-06 | Floating rectangle | Shift+click another floating rectangle | Adds it to the selection; each shows its outline only (no handles, no dots); pane shows Mixed where values differ. | F-SEL; CD-05 | T-SEL-06 | in |
| RC-SEL-07 | Multi-selection | Shift+click a selected rectangle | Removes it from the selection; one left restores full chrome. | F-SEL | T-SEL-07 | in |
| RC-SEL-08 | Unselected rectangle | hover | 1 px accent hover outline; none on a selected one; none while another drag runs. | F-SEL (layer highlight on hover) | T-SEL-08 | in |
| RC-SEL-09 | Radius dots | visibility | Shown when one rectangle is selected and both on-screen sides ≥ 32 px; inset on the diagonal at the current radius (minimum inset when radius is 0). | SS-RAD; CD-12 | T-SEL-09 | in |
| RC-SEL-10 | Inline rectangle | Shift+click | Not added to a shape selection; Shift+click extends the text selection as in Word. | CD-05; W-WRAP | T-SEL-10 | in |
| RC-SEL-11 | Inline rectangle | caret next to it, Shift+Right/Left | Text selection includes it as one character; Delete removes it with the text. | W-WRAP | T-SEL-11 | in |
| RC-SEL-12 | Behind-text rectangle | click on text above it | Caret goes into the text; rectangle not selected. | W-LO | T-SEL-12 | in |
| RC-SEL-13 | Document objects list (pane) | click an entry | Selects that rectangle (including behind-text ones) and scrolls it into view. | SPEC-DP4; PROTO | T-SEL-13 | in |
| RC-SEL-14 | Selection after delete | Delete | Nothing selected; caret where the inline rectangle was, or at the anchor paragraph. | CD | T-SEL-14 | in |
| RC-SEL-15 | Selection during text editing | entering text editing | Outline stays (dashed, as Word's text-box edit state); handles hidden; pane stays on the rectangle. | CD-11 | T-SEL-15 | in |
| RC-SEL-16 | Rectangle scrolled off screen | stays selected | Selection kept; pane still editable; scrolling does not deselect. | CD | T-SEL-16 | in |
| RC-SEL-17 | Zoom change | while selected | Chrome stays 1 px / fixed-size handles at every zoom. | CD (source does not state it; critic phase 2) | T-SEL-17 | in |
| RC-SEL-18 | Inline vs floating appearance | unselected | Both render identically apart from position; floating shows no anchor marker unless selected. | SPEC-DP3 | T-SEL-18 | in |
| RC-SEL-19 | Ctrl+A | rectangle selected (not editing) or caret in text | Selects all document text as Word does (inline rectangles included as characters); floating rectangles are not shape-selected; inside text editing selects the rectangle's own text. | F-SEL; CD | T-SEL-19 | in |
| RC-SEL-20 | Pane | no rectangle shape-selected: caret in text, a text selection (including one that contains an inline rectangle as a character, RC-SEL-11), or nothing | The shape sections (Position, Layout, Appearance, Fill, Stroke, Text wrapping, Arrange) are **not rendered** (not shown disabled); the pane shows only the Document objects list with no entry marked and one line of help, "Select a shape to change it"; Tab skips nothing that is hidden and never traps focus; shape-selecting a rectangle brings the sections back at the pane's previous scroll position. | [F-PANEL](https://help.figma.com/hc/en-us/articles/360039832014) (fetched 15:16: with nothing selected the Design tab shows file-level items, not layer properties); **CD** for the document empty state (a document has no canvas background or page export to show here) | T-SEL-20 | in |
| RC-SEL-21 | Insert rectangle | Insert > Rectangle or command search, with (a) text selected, (b) caret or selection inside a rectangle's own text, (c) caret at the end of a page, (d) any | Entry points: **Insert > Rectangle** and command search; no keyboard shortcut in this slice. (a) The rectangle replaces the selected text as an inline character, as Word replaces a selection with what is inserted; a text selection that contains an inline rectangle as a character (RC-SEL-11) is replaced **as text, that rectangle included**, as in Word; one undo step restores the text (and any rectangle it contained, with all its properties) and removes the new rectangle (RC-UR-01). (b) Not allowed: the menu item is disabled with the reason "A rectangle can't go inside another rectangle" (matches RC-WP-05). (c) Inserted at the caret; if it does not fit on the line or page it moves to the next line or page like any character (RC-WP-03). (d) Default size 200 × 120 px, with the other CD-08 defaults; selected on insert (RC-SEL-01). | [W-INS](https://support.microsoft.com/en-us/word/training/insert-pictures) (fetched 15:17: Insert tab entry; it does not cover a selection); **CD** for (a)–(d) (reason: Word's insert-replaces-selection is followed for text flow, precedence 2; nesting would make a shape inside a shape, which no flow allows; the size is visible and editable on any page) | T-SEL-21 | in |
| RC-SEL-22 | Insert rectangle | Insert > Rectangle or command search with one or more rectangles shape-selected (not editing their text) | Never replaces or removes a shape (as RC-CAN-29 protects content). One inline rectangle selected: the new rectangle is inserted inline right after it, in the same paragraph. A floating rectangle (or a floating multi-selection, CD-05) selected: the new rectangle is inserted inline at the start of the anchor paragraph of the selected rectangle that is **first in document order** (the earliest anchor paragraph; ties broken by z-order, lowest first; never by click order), the same place RC-WP-14 puts a floating rectangle made inline. Only the new rectangle is selected afterwards (RC-SEL-01); one undo step removes it and restores the previous selection (RC-UR-01). | [W-INS](https://support.microsoft.com/en-us/word/training/insert-pictures) (fetched 15:17: does not say what happens to a selected object); **CD** (reason: Word's replace-the-selection is followed for text, including inline rectangles inside a text selection (RC-SEL-21a), but a **shape-selected** rectangle is never replaced by an insert; inserting next to the selection keeps the new shape where the writer is looking; document order, not click history, picks the place because click history is invisible) | T-SEL-22 | in |

## 4. Canvas editing

| ID | Control/element | Input/state | Expected behaviour | Source | Test ID | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| RC-CAN-01 | Move floating | drag | Position follows the pointer; anchor reassigns to the paragraph under the new top edge (unless Fix on page keeps page coordinates); text reflows live. | W-LO; SPEC-DP3 | T-CAN-01 | in |
| RC-CAN-02 | Move floating across pages | drag to another page | Lands on that page; anchor moves to a paragraph on that page. | W-LO | T-CAN-02 | in |
| RC-CAN-03 | Move inline | drag | Character-boundary insertion; source position closes up; text reflows. | W-WRAP; SPEC-DP1 | T-CAN-03 | in |
| RC-CAN-04 | Resize: top-left handle | drag | Bottom-right corner fixed; W and H change; X/Y change for floating. | F-ARPD | T-CAN-04 | in |
| RC-CAN-05 | Resize: top handle | drag | Bottom edge fixed; H changes only. | F-ARPD | T-CAN-05 | in |
| RC-CAN-06 | Resize: top-right handle | drag | Bottom-left fixed; W and H change. | F-ARPD | T-CAN-06 | in |
| RC-CAN-07 | Resize: right handle | drag | Left edge fixed; W changes only. | F-ARPD | T-CAN-07 | in |
| RC-CAN-08 | Resize: bottom-right handle | drag | Top-left fixed; W and H change. | F-ARPD | T-CAN-08 | in |
| RC-CAN-09 | Resize: bottom handle | drag | Top edge fixed; H changes only. | F-ARPD | T-CAN-09 | in |
| RC-CAN-10 | Resize: bottom-left handle | drag | Top-right fixed; W and H change. | F-ARPD | T-CAN-10 | in |
| RC-CAN-11 | Resize: left handle | drag | Right edge fixed; W changes only. | F-ARPD | T-CAN-11 | in |
| RC-CAN-12 | Resize a rotated rectangle | any handle | Resizes in the rectangle's own axes; the opposite handle stays fixed on screen. | F-ARPD | T-CAN-12 | in |
| RC-CAN-13 | Resize with radius set | shrink below 2 × radius | Radius values clamp to the new half shorter side. | OD-RAD | T-CAN-13 | in |
| RC-CAN-14 | Resize inline | any handle | Line height grows/shrinks to fit; X/Y never shown. | W-WRAP; OD-INL | T-CAN-14 | in |
| RC-CAN-15 | Rotate | rotation zone drag | About the centre; field shows (−180, 180]. | F-ARPD; CD-01 | T-CAN-15 | in |
| RC-CAN-16 | Rotate | Shift+drag | 15° increments. | F-ARPD | T-CAN-16 | in |
| RC-CAN-17 | Rotate inline | drag | Allowed; the line box grows to the rotated bounding box. | OD-ROT; W-WRAP | T-CAN-17 | in |
| RC-CAN-18 | Radius drag, all corners | drag a dot | See RC-CLK-31; dots move along their diagonals with the value. | OD-RAD | T-CAN-18 | in |
| RC-CAN-19 | Radius drag, one corner | Alt+drag a dot | See RC-CLK-32. | OD-RAD; F-CR | T-CAN-19 | in |
| RC-CAN-20 | Radius dot | focused, Up/Right | +10 (Shift +100); Down/Left −10 (Shift −100); Home 0; End maximum; Alt keeps it to one corner. | OD-RAD | T-CAN-20 | in |
| RC-CAN-21 | Nudge floating | Arrow keys | Moves 1 px; text reflows; one undo step per key press. | F-ARPD | T-CAN-21 | in |
| RC-CAN-22 | Nudge floating | Shift+Arrow | Moves 10 px. | F-ARPD | T-CAN-22 | in |
| RC-CAN-23 | Arrow keys on an inline rectangle | Arrow / Shift+Arrow with an inline rectangle shape-selected | Follows Word: the rectangle is a character and does **not** move. Left places the caret just before it and Right just after it, ending the shape selection; Up/Down end the shape selection and move the caret one line up/down from the rectangle's position; Shift+Arrow ends the shape selection and extends a text selection from that position that includes the rectangle as one character (RC-SEL-11). An inline rectangle moves by drag (RC-CLK-16) or by switching to a floating mode. No undo step. | [W-KBD](https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-word-95ef89dd-7142-4b50-afb2-f762f663ceb2) (fetched 15:16: arrow keys move the cursor, Shift+Arrow keys select text); W-WRAP (inline behaves as text); conflict 13 | T-CAN-23 | in |
| RC-CAN-24 | Delete | Delete or Backspace with the rectangle selected | Removes it and its text; inline closes up; one undo step. | **CD** (source does not state it: the F-KBD page fetched 15:16 lists no Delete key). Reason: Delete and Backspace remove a selected object in both reference products in use and in every desktop editor; undo restores it (RC-UR-02), so nothing is lost. | T-CAN-24 | in |
| RC-CAN-25 | Duplicate | Ctrl+D with a rectangle selected (not in text editing) | Duplicates **in place**: floating copy at the same X/Y, on top in its plane, selected (it exactly covers the original). Inline: copy inserted right after the original, selected. The copy carries **every** property of the original: wrap mode, wrap distances, references, position behaviour, anchor paragraph, size, rotation, flip, radii, fill, stroke, opacity and its text (RC-WP-37), and its **name**: as in Figma, the copy keeps the original's name ("Rectangle 2" stays "Rectangle 2"), never renumbered; the two are told apart in Document objects by list position (RC-BTN-24) and in their accessible names by "k of n" (RC-KB-02). It has its own undo history entries (RC-UR-33). Ctrl+D elsewhere keeps the document's own binding. | F-SMS ("Duplicate Selection in Place"); [Figma copy and paste](https://help.figma.com/hc/en-us/articles/4409078832791-Copy-and-paste-objects) (fetched 15:45: duplicate "is a shorthand for copy and paste", placed "on top of the original"; naming not stated) and [Figma rename layers](https://help.figma.com/hc/en-us/articles/360039958934-Rename-layers) (fetched 15:45: distinct names come from the Rename layers numbering, not from duplicating); the kept name follows Figma in use (observed; no fetched page says otherwise); CD (inline placement, binding scope); blind review 12d F3; critic r4 #2 | T-CAN-25 | in |
| RC-CAN-26 | Esc | selected, idle | Deselects (RC-SEL-05). | CD-11 | T-CAN-26 | in |
| RC-CAN-27 | Esc | in text editing | Leaves text editing; rectangle stays selected. | CD-11 | T-CAN-27 | in |
| RC-CAN-28 | Enter | selected | Enters text editing, caret at the end of its text. | CD-11; F-SEL | T-CAN-28 | in |
| RC-CAN-29 | Typing | selected (not editing) | Printable keys do not replace the rectangle; they are ignored (Word replaces; we protect content). | CD | T-CAN-29 | in |
| RC-CAN-30 | Text inside | editing | Native paragraphs; text wraps to the inner width; text rotates with the shape. | spec U114 | T-CAN-30 | in |
| RC-CAN-31 | Snapping and smart guides | any drag | None shown, none applied. | CD-06 | T-CAN-31 | out |
| RC-CAN-32 | Flip horizontal | pane button or Shift+H | Mirrors left-right about the centre; X/Y/W/H unchanged; text inside stays readable (only the shape geometry flips). | F-ARPD; SS-PANE | T-CAN-32 | in |
| RC-CAN-33 | Flip vertical | pane button or Shift+V | Mirrors top-bottom; same rules. | F-ARPD; SS-PANE | T-CAN-33 | in |
| RC-CAN-34 | Rotate 90° | pane button | Adds 90° (wrapping per CD-01). | SS-PANE; PROTO | T-CAN-34 | in |
| RC-CAN-35 | Shift+H / Shift+V | while editing text | Types the letter; no flip. | CD | T-CAN-35 | in |

## 5. Pane number fields: shared behaviour (one component, tested per field)

Every row in this table is run against **every** field in section 6 (parametrised test, one case per field: `T-NF-xx[field]`).

| ID | Control/element | Input/state | Expected behaviour | Source | Test ID | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| RC-NF-01 | Any number field | plain click (no movement beyond 3 px) | Focuses for typing; text fully selected. | OD-NUM | T-NF-01 | in |
| RC-NF-02 | Any number field | click and drag horizontally | Scrubs: right increases, left decreases, 1 unit per px; value and shape update live. | OD-NUM; F-ARPD scrub | T-NF-02 | in |
| RC-NF-03 | Any number field | scrub start | Pointer Lock requested; cursor hidden; drag continues past the screen edge. | OD-NUM; F-ARPD (scrubbing continues off screen) | T-NF-03 | in |
| RC-NF-04 | Any number field | scrub release | Pointer Lock released; cursor reappears where the drag started; one undo step. | OD-NUM | T-NF-04 | in |
| RC-NF-05 | Any number field | Shift held while scrubbing | Delta × 10. | CD-10 | T-NF-05 | in |
| RC-NF-06 | Any number field | Esc while scrubbing | Value returns to the pre-scrub value; lock released; no undo step. | OD-NUM (Esc reverts); CD | T-NF-06 | in |
| RC-NF-07 | Any number field | Pointer Lock refused by the system | Scrub still works with the visible cursor; no error shown. | CD | T-NF-07 | in |
| RC-NF-08 | Any number field | scrub from the label or icon | Same as scrubbing the field. | F-ARPD | T-NF-08 | in |
| RC-NF-09 | Focused field | type a number, Enter | Applies (clamped, rounded); stays focused with text selected; one undo step. | OD-NUM | T-NF-09 | in |
| RC-NF-10 | Focused field | Esc | Reverts to the value at focus; blurs; focus returns to the selected rectangle. | OD-NUM | T-NF-10 | in |
| RC-NF-11 | Focused field | Tab / Shift+Tab | Commits, moves to the next / previous control in pane order (RC-KB-03). | CD | T-NF-11 | in |
| RC-NF-12 | Focused field | blur by clicking elsewhere | Commits. | CD | T-NF-12 | in |
| RC-NF-13 | Focused field | Up / Down | +1 / −1, applied immediately, clamped; one undo step per press. | OD-NUM | T-NF-13 | in |
| RC-NF-14 | Focused field | Shift+Up / Shift+Down | +10 / −10, clamped. | OD-NUM | T-NF-14 | in |
| RC-NF-15 | Focused field | maths: `+10`, `-20`, `*2`, `/4`, `^2`, `(x/2)+6` appended to or replacing the value | Evaluated on commit; result clamped and rounded. | F-ARPD equations | T-NF-15 | in |
| RC-NF-16 | Focused field | invalid input (letters, `5//`, divide by 0, empty, exponent notation such as `1e9`, unsupported units such as `2in`, `10mm`, `abc`) | Reverts **quietly** to the previous value on commit: the field simply shows the old value again; no message, no dialog, no change, no undo step. Focus then behaves exactly as for valid input: Enter keeps the field focused with the restored value selected (RC-NF-09); Tab / Shift+Tab moves on (RC-NF-11); clicking away leaves (RC-NF-12). `1e9` is invalid because the equation grammar is digits, `.` and `+ - * / ^ ( )` only (F-ARPD); a large value written as digits or maths (`1000000000`, `10^9`) is valid and clamps (RC-NF-17). | [F-ARPD](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions) (equation operators; the page, re-fetched 15:33, says nothing about invalid input or feedback); **CD** for quiet revert (reason: the restored value is the feedback, matching Figma's fields in use; a message would interrupt for a typo that changed nothing; invalid input changes nothing, focus included, critic r4 #3); blind review 12d F5 | T-NF-16 | in |
| RC-NF-17 | Focused field | value above max or below min (typed, scrubbed, arrows, maths) | Clamped to the field's bound (`1000000000` or `10^9` in W → `10000`; `-50` → `1`). Rotation does not clamp: it wraps (RC-FLD-05). | OD-NUM; CD-03; blind review 12d F5 | T-NF-17 | in |
| RC-NF-18 | Any field | units | Shows its unit (px, °, %) directly after the value as one string (`100%`, `45°`), never pinned to the field's far edge; typing the unit (`12px`, `45°`, `45deg`, `50%`) is accepted; other units rejected per RC-NF-16. | OD-NUM ("units kept"); SS-PANE (Opacity and fill "100%" inline); blind review a12 F3 | T-NF-18 | in |
| RC-NF-19 | Field showing Mixed | display | Empty value with "Mixed" placeholder; accessible value "Mixed". | F-ARPD (`Mixed+100`); OD-NUM; PROTO | T-NF-19 | in |
| RC-NF-20 | Field showing Mixed | type a plain number, Enter | Sets every value it stands for to that number. | F-ARPD; PROTO | T-NF-20 | in |
| RC-NF-21 | Field showing Mixed | `+N`, `*N` etc. | Applied to each value individually, each clamped. | F-ARPD; CD-02 | T-NF-21 | in |
| RC-NF-22 | Field showing Mixed | Up/Down, Shift+Up/Down, scrub | Step added to each value individually, each clamped. | OD-NUM; CD-02 | T-NF-22 | in |
| RC-NF-23 | Field showing Mixed | Esc | Stays Mixed; nothing changes. | CD | T-NF-23 | in |
| RC-NF-24 | Disabled field | any input | No scrub, no focus by click, skipped by Tab; tooltip says why. | CD | T-NF-24 | in |
| RC-NF-25 | Any field | hover (no press) | Tooltip with the full name (e.g. "Width"); no shortcut (fields have none). | F-PANEL; CD | T-NF-25 | in |
| RC-NF-26 | Any field | hover / focus states | Hover: field border token; focus: focus ring token; scrubbing: active fill token. | design system | T-NF-26 | in |
| RC-NF-27 | Any field | Ctrl+Z while typing (uncommitted) | Undoes the typing inside the field only; document unchanged. | CD | T-NF-27 | in |
| RC-NF-28 | Any field | value change from canvas or undo while not focused | Field updates immediately. | CD | T-NF-28 | in |
| RC-NF-29 | Shared component | implementation | Every field uses one number-field component; no field has its own scrub or key code. | OD-NUM | T-NF-29 | in |
| RC-NF-30 | Any field | mouse wheel over field | No value change (page scrolls). | CD | T-NF-30 | in |
| RC-NF-31 | Focused field | Left / Right | Moves the text caret; no value change. Figma's Left/Right radius nudge is not adopted so every field behaves alike. | F-CR; OD-NUM; CD | T-NF-31 | in |
| RC-NF-32 | Any number field | result of typing, maths, scrub or arrow keys | Stored and shown to at most 2 decimals, rounded half away from zero (`12.345` → `12.35`); trailing zeros dropped (`12.50` shows `12.5`, `12.00` shows `12`). Scrub and arrow steps add whole units to the current value and never add new fractions (`12.5` + Up → `13.5`); a scrub counts whole px of pointer movement (sub-pixel movement, zoom and display scaling are accumulated, never applied as fractions), so scrubbing X, Y, W, H or any field from a whole value always gives a whole value (`1600` + 50 px → `1650`, never `1650.25`). Opacity fields (layer, fill, stroke) are whole percentages (`50.5%` → `51%`). Canvas radius drags give whole px (RC-CLK-31). A decimal comma (`12,5`) is invalid and reverts (RC-NF-16); there is no locale decimal comma in this slice. A negative or zero W/H (`-5`) clamps to 1 (RC-NF-17). Mixed fields apply the rounding to each value. | OD-NUM (clamp, Mixed applies to all); [F-ARPD](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions) (fetched 15:16: mentions decimal values but no display precision); **CD** for the precision (reason: 2 decimals is enough for any page layout and matches the rotation field, RC-FLD-05; one rule lets T-NF-09/15 assert exact values); CD-03 | T-NF-32 | in |

## 6. Pane number fields: each field

| ID | Control/element | Input/state | Expected behaviour | Source | Test ID | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| RC-FLD-01 | X | floating | −10 000…10 000 px, relative to the chosen horizontal reference; Mixed in multi-select; hidden for inline. | F-ARPD; W-LO; OD-INL | T-FLD-01 | in |
| RC-FLD-02 | Y | floating | −10 000…10 000 px, relative to the vertical reference; Mixed; hidden for inline. | F-ARPD; W-LO; OD-INL | T-FLD-02 | in |
| RC-FLD-03 | X / Y on a rotated rectangle | value | Measured at the unrotated top-left corner of the bounds. | F-ARPD ("based on the original top-left corner") | T-FLD-03 | in |
| RC-FLD-04 | X / Y | reference changed | Value recomputed so the rectangle does not move on the page. | CD (source does not state it; critic phase 2) | T-FLD-04 | in |
| RC-FLD-05 | Rotation | any | (−180, 180]°, up to 2 decimals typed; positive = counter-clockwise; Mixed. Every result (typed, maths, scrub, arrows, Rotate 90°) is **normalised by whole turns** into (−180, 180], never clamped and never stored outside it: `400` → `40`, `-190` → `170`, `540` → `180`, `360` → `0`, `181` → `-179`. Shown as the value with `°` directly after it (`40°`), never pinned to the field's far edge (RC-NF-18). | [F-ARPD](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions) (re-fetched 15:33: "Once you pass 180 in either direction, Figma will count down towards 0° … going 15° past 180° will give you an angle of -165°"); CD-01; SS-PANE (`0°` inline); blind review 12d F4, F8 | T-FLD-05 | in |
| RC-FLD-06 | W | any | 1…10 000 px; with lock on, H follows by ratio; Mixed. | F-ARPD; CD-03 | T-FLD-06 | in |
| RC-FLD-07 | H | any | 1…10 000 px; with lock on, W follows; Mixed. | F-ARPD; CD-03 | T-FLD-07 | in |
| RC-FLD-08 | W / H with lock on | ratio pushes the other side past a bound | Both clamp so the ratio holds as close as the bounds allow. | CD | T-FLD-08 | in |
| RC-FLD-09 | Opacity | any | 0…100 %; affects fill, stroke and inner text; Mixed. | SS-PANE; F-PANEL | T-FLD-09 | in |
| RC-FLD-10 | Corner radius (all) | any | 0…⌊min(W,H)/2⌋ px; sets all four; Mixed when corners differ. | F-CR; OD-RAD; PROTO | T-FLD-10 | in |
| RC-FLD-11 | Top-left radius | independent corners open | 0…⌊min(W,H)/2⌋; changes that corner only. | F-CR; OD-NUM | T-FLD-11 | in |
| RC-FLD-12 | Top-right radius | same | Same, top-right only. | F-CR; OD-NUM | T-FLD-12 | in |
| RC-FLD-13 | Bottom-left radius | same | Same, bottom-left only. | F-CR; OD-NUM | T-FLD-13 | in |
| RC-FLD-14 | Bottom-right radius | same | Same, bottom-right only. | F-CR; OD-NUM | T-FLD-14 | in |
| RC-FLD-15 | Corner fields | in multi-select with differing values | Mixed per corner. | OD-NUM | T-FLD-15 | in |
| RC-FLD-16 | Fill opacity | fill present | 0…100 %, separate from layer Opacity; hidden when no fill. | F-FILL; SS-PANE | T-FLD-16 | in |
| RC-FLD-17 | Stroke opacity | stroke present | 0…100 %; hidden when no stroke. | F-STROKE | T-FLD-17 | in |
| RC-FLD-18 | Stroke weight | stroke present | 0…100 px; not added to W/H; hidden when no stroke. | F-STROKE; CD-03 | T-FLD-18 | in |
| RC-FLD-19 | Wrap distance top | Square, Tight, Top and Bottom | 0…200 px. | W-LO | T-FLD-19 | in |
| RC-FLD-20 | Wrap distance bottom | Square, Tight, Top and Bottom | 0…200 px. | W-LO | T-FLD-20 | in |
| RC-FLD-21 | Wrap distance left | Square, Tight | 0…200 px; disabled for Top and Bottom (tooltip "No text beside the shape in Top and bottom"). | W-LO | T-FLD-21 | in |
| RC-FLD-22 | Wrap distance right | Square, Tight | Same as left. | W-LO | T-FLD-22 | in |
| RC-FLD-23 | Wrap distances | Inline, Behind, In front | Hidden. | W-LO; SPEC-DP3 | T-FLD-23 | in |
| RC-FLD-24 | X / Y / alignment / references / position behaviour | inline | Hidden (not merely disabled); returning to a floating mode shows them again. | OD-INL; SPEC-DP3 | T-FLD-24 | in |

## 7. Pane buttons and toggles

Shared states for every button (`T-BTN-01…04` run per button): hover = hover fill token; pressed (mouse down) = pressed fill token; toggled on = selected fill token with `aria-pressed="true"` (or `aria-checked` in a radio group); keyboard focus = focus ring token; disabled = disabled tokens, `aria-disabled`, no hover.

| ID | Control/element | Input/state | Expected behaviour | Source | Test ID | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| RC-BTN-01 | Every pane button | hover | Hover fill; tooltip after the standard delay. | F-PANEL; design system | T-BTN-01 | in |
| RC-BTN-02 | Every pane button | mouse down | Pressed fill until release; action on release inside the button. | design system | T-BTN-02 | in |
| RC-BTN-03 | Every pane button | keyboard focus | Visible focus ring; Space/Enter activates. | WCAG; design system | T-BTN-03 | in |
| RC-BTN-04 | Every pane button | disabled | No hover, no action, tooltip gives the reason. | CD | T-BTN-04 | in |
| RC-BTN-05 | Wrap mode group: In line with text, Square, Tight, Top and bottom, Behind text, In front of text | click / arrows within the group | Radio group; one checked; tooltip is the full name; changes layout (section 9). | W-LO; SPEC-DP2; PROTO | T-BTN-05 | in |
| RC-BTN-06 | Align left / horizontal centre / right | floating, click | Aligns to the horizontal reference (Page, Margin, Column); tooltip "Align left" etc.; hidden inline; disabled with Character reference (tooltip says why). | W-LO alignment; SS-PANE | T-BTN-06 | in |
| RC-BTN-07 | Align top / vertical centre / bottom | floating, click | Aligns to the vertical reference (Page, Margin, Line); disabled with Paragraph reference (Word has only absolute position for Paragraph). | W-LO; SS-PANE | T-BTN-07 | in |
| RC-BTN-08 | Rotate 90° | click | Icon-only button (rotate icon, no visible text such as "90°"), beside the rotation field and before Flip horizontal / Flip vertical (also icon-only); +90°; tooltip and accessible name "Rotate 90°". | SS-PANE; PROTO; blind review a12 F3 | T-BTN-08 | in |
| RC-BTN-09 | Flip horizontal | click | Flips; tooltip "Flip horizontal (Shift+H)". | F-ARPD | T-BTN-09 | in |
| RC-BTN-10 | Flip vertical | click | Flips; tooltip "Flip vertical (Shift+V)". | F-ARPD | T-BTN-10 | in |
| RC-BTN-11 | Lock aspect ratio | toggle | On: W/H and canvas resizes keep ratio; tooltip "Lock aspect ratio". | F-ARPD; SS-PANE | T-BTN-11 | in |
| RC-BTN-12 | Independent corners | toggle | Opens the four corner fields; when closed, the single field shows a value or Mixed; tooltip "Independent corners". | F-CR; SS-PANE | T-BTN-12 | in |
| RC-BTN-13 | Horizontal reference select | floating | Page, Margin, Column, Character; keyboard-operable list. | W-LO | T-BTN-13 | in |
| RC-BTN-14 | Vertical reference select | floating | Page, Margin, Paragraph, Line. | W-LO | T-BTN-14 | in |
| RC-BTN-15 | Position behaviour: Move with text / Fix on page | floating | Two-option segmented toggle; tooltips state the effect. | W-LO; SPEC-DP3 | T-BTN-15 | in |
| RC-BTN-16 | Bring to front | floating | Tooltip "Bring to front (Ctrl+Shift+])"; disabled when already front-most in its plane. | F-ARPD; SPEC-DP4 | T-BTN-16 | in |
| RC-BTN-17 | Bring forward | floating | Tooltip "Bring forward (Ctrl+])"; same disabling. | F-ARPD; SPEC-DP4 | T-BTN-17 | in |
| RC-BTN-18 | Send backward | floating | Tooltip "Send backward (Ctrl+[)"; disabled when back-most. | F-ARPD; SPEC-DP4 | T-BTN-18 | in |
| RC-BTN-19 | Send to back | floating | Tooltip "Send to back (Ctrl+Shift+[)"; disabled when back-most. | F-ARPD; SPEC-DP4 | T-BTN-19 | in |
| RC-BTN-20 | Arrange buttons | inline | Hidden. | SPEC-DP4; OD-INL | T-BTN-20 | in |
| RC-BTN-21 | Add fill (+) / Add stroke (+) | slot empty | Adds a default solid paint; tooltip "Add fill" / "Add stroke". While a fill (or stroke) exists the + is **not rendered** (not shown dimmed or disabled); it returns after Remove (RC-BTN-23). The Fill and Stroke section headers carry only the heading and this + (when empty): Figma's "styles and variables" header icon is **not** rendered (RC-OS-13, RC-BTN-25; conflict 16). | F-FILL; CD-07; SS-PANE; blind review a12 F3; blind review 12d F8 | T-BTN-21 | in |
| RC-BTN-22 | Hide fill / stroke (eye) | toggle | Hides without removing; icon switches to closed eye; tooltip "Hide fill" / "Show fill". | F-FILL | T-BTN-22 | in |
| RC-BTN-23 | Remove fill / stroke (−) | click | Removes the paint; + returns. | F-FILL | T-BTN-23 | in |
| RC-BTN-24 | Document objects list | click / arrows / Enter | Selects the rectangle; current selection marked. Entries are listed in **document order** (by anchor position; ties by z-order, back to front) and each shows its name plus wrap mode. A newly inserted rectangle is named "Rectangle N", N = 1 + the highest number among the document's rectangles ("Rectangle 1", "Rectangle 2", …). A Ctrl+D copy keeps the original's name (RC-CAN-25), so two entries can share a name; the copy is listed directly after its original (same anchor, on top), and each entry exposes its position ("2 of 3", `aria-posinset` / `aria-setsize`). Test asserts names, order and positions after an insert and a Ctrl+D. | SPEC-DP4; PROTO; CD for numbering and order (reason: a list of shapes must be stable and each entry reachable; critic r4 #2) | T-BTN-24 | in |
| RC-BTN-25 | Blend mode, Effects, Export, Style/variable buttons | any | Not rendered anywhere in the pane: no blend select row (under Export or elsewhere) and no blend icon in the Appearance header; no Effects or Export sections (no inert controls). Figma's Appearance-header blend icon is not adopted because blend is out (RC-OS-12). | SPEC-DP4 ("no unsupported inert controls"); RC-OS-12; blind review a12 F3 | T-BTN-25 | in |
| RC-BTN-26 | Every non-number control: wrap-mode radio group, horizontal / vertical reference selects, Move with text / Fix on page toggle, Lock aspect ratio, stroke position select, fill / stroke slot, eye | multi-selection (floating only, CD-05) whose values differ | Shows **Mixed**: a radio group or segmented toggle has no option checked (`aria-checked="false"` on all); a select shows "Mixed" as its value; a toggle shows its indeterminate look with `aria-pressed="mixed"`; an eye shows the indeterminate look; a paint slot (fill or stroke) present on some rectangles but not others shows "Mixed" with only two buttons: **+** adds the default paint (RC-COL-01 / RC-COL-13) only to those without one, existing paints kept; **−** removes that paint from **all** selected rectangles; each is one undo step (RC-UR-27). In that state the swatch, hex, paint opacity, eye, stroke weight and stroke position are **not rendered**, so no field can edit a paint that some rectangles don't have. **Independent corners** is pane state, not a rectangle value (RC-UR-16): it is never Mixed; when corners differ across or within the selected rectangles, the single Corner radius field shows Mixed (RC-FLD-10, RC-FLD-15). Choosing an option (or clicking a toggle or eye) sets that one value on **every** selected rectangle as one undo step (RC-UR-27); hidden-for-inline rules still apply. | OD-NUM (Mixed; a change applies to all values Mixed stands for); [F-ARPD](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions) (fetched 15:16: Mixed for number fields only); [F-FILL](https://help.figma.com/hc/en-us/articles/360041003694-Guide-to-fills) (re-fetched 15:26: documents + to add and − to remove a fill, and no Mixed state for a paint present on only some layers; conflict 14); CD-05; **CD** for non-number controls (reason: one Mixed rule across the pane, never shows a value that is true for only some rectangles, + never overwrites a paint, and no field edits a paint that doesn't exist) | T-BTN-26 | in |

## 8. Fill, stroke and colour

| ID | Control/element | Input/state | Expected behaviour | Source | Test ID | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| RC-COL-01 | Fill on insert | new rectangle | Solid fill, 100 %, visible; the colour is the shape-fill token's **light-theme value stored in the document as a fixed hex**, never a live token, so it doesn't change with the theme (CD-08, RC-KB-21). | CD-08; RC-KB-21; SS-PANE | T-COL-01 | in |
| RC-COL-02 | Fill swatch | click | Opens the colour picker anchored to the swatch; focus moves into it. | F-PICK | T-COL-02 | in |
| RC-COL-03 | Colour picker | drag in the saturation/brightness area or hue slider | Colour updates live on canvas and in hex; one undo step per release. | F-PICK | T-COL-03 | in |
| RC-COL-04 | Colour picker | Esc / click outside | Closes, keeps the applied colour; focus returns to the swatch. | CD (source does not state it; critic phase 2) | T-COL-04 | in |
| RC-COL-05 | Colour picker | keyboard | Area and slider operable with arrows (1 step; Shift 10). | WCAG; CD | T-COL-05 | in |
| RC-COL-06 | Hex field (fill or stroke) | type `5988CC`, `#5988cc`, `58C` | Accepted (3 or 6 digits, `#` optional, any case); shown as 6 uppercase digits on commit. | F-PICK; SS-PANE; PROTO | T-COL-06 | in |
| RC-COL-07 | Hex field | invalid (`GGG`, 4/5/7/8 digits, empty) | Reverts to the previous colour; no undo step. | CD | T-COL-07 | in |
| RC-COL-08 | Hex field | Enter / Esc / Tab / blur | Enter applies; Esc reverts; Tab and blur commit. | OD-NUM (same field contract) | T-COL-08 | in |
| RC-COL-09 | Hex field | multi-select with different colours | Shows Mixed; typing sets all. | F-PICK (selection colours, simplified) | T-COL-09 | in |
| RC-COL-10 | Fill opacity | see RC-FLD-16 | Fill alpha only; layer Opacity unaffected. | F-FILL | T-COL-10 | in |
| RC-COL-11 | Fill hidden | eye off | Shape renders with no fill; values kept; wrap contour unchanged. | F-FILL; CD | T-COL-11 | in |
| RC-COL-12 | Fill removed | − | Shape transparent; text inside still visible; wrap contour unchanged. | F-FILL | T-COL-12 | in |
| RC-COL-13 | Add stroke | + | Solid stroke, 1 px, Inside, 100 %; the colour is the dark-neutral token's **light-theme value stored in the document as a fixed hex**, never a live token (CD-08, RC-KB-21). | F-STROKE (inside default); CD-08; RC-KB-21 | T-COL-13 | in |
| RC-COL-14 | Stroke position select | Inside / Center / Outside | Changes where the stroke sits; W/H unchanged; keyboard-operable. | F-STROKE; PROTO | T-COL-14 | in |
| RC-COL-15 | Stroke weight | see RC-FLD-18 | Weight 0 keeps the stroke entry but draws nothing. | F-STROKE | T-COL-15 | in |
| RC-COL-16 | Stroke and wrap | Center / Outside stroke | Wrap contour includes the visible stroke extent outside the geometry. | W-LO (wrap around the shape as drawn); CD | T-COL-16 | in |
| RC-COL-17 | Stroke hidden / removed | eye / − | Same as fill rows; wrap contour falls back to geometry. | F-FILL; F-STROKE | T-COL-17 | in |
| RC-COL-18 | Stroke with radius | radius > 0 | Stroke follows the rounded corners. | F-STROKE | T-COL-18 | in |
| RC-COL-19 | Fill reorder / multiple fills | drag handle | Not offered. | CD-07 | T-COL-19 | out |
| RC-COL-20 | Stroke position select | hover an option | No canvas preview; choosing applies live as one undo step. | F-STROKE; CD | T-COL-20 | out |
| RC-COL-21 | Colour picker | opacity slider | Present and bound to the same value as Fill / Stroke opacity (RC-FLD-16/17); one undo step per release. | F-PICK | T-COL-21 | in |

## 9. Word placement (wrap, anchor, references, arrange)

| ID | Control/element | Input/state | Expected behaviour | Source | Test ID | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| RC-WP-01 | In line with text | unrotated | Sits on the text baseline as one character; line height grows to fit; surrounding text reflows as typed. | W-WRAP; W-LO; OD-INL | T-WP-01 | in |
| RC-WP-02 | In line with text | rotated | Occupies its axis-aligned rotated bounding box in the line. | OD-ROT; W-WRAP | T-WP-02 | in |
| RC-WP-03 | In line with text | typing before it | It moves with the text; it can move to the next line or page. | W-WRAP | T-WP-03 | in |
| RC-WP-04 | In line with text | pane | No X/Y, alignment, references, position behaviour, wrap distances or arrange controls. | OD-INL; SPEC-DP1 | T-WP-04 | in |
| RC-WP-05 | In line with text | drag | Moves as a character between words (RC-CLK-16); dropping inside another rectangle's text is refused (returns). | W-WRAP; CD | T-WP-05 | in |
| RC-WP-06 | Square | unrotated | Text wraps around the bounding box plus top/bottom/left/right distances on all sides that have room. | W-LO | T-WP-06 | in |
| RC-WP-07 | Square | rotated | Wraps around the axis-aligned rotated bounding box plus distances. | OD-ROT | T-WP-07 | in |
| RC-WP-08 | Tight | unrotated, radius 0 | Wraps around the rectangle's real contour; for a sharp rectangle this equals Square at equal distances (no fake difference). | W-LO; spec DP2 | T-WP-08 | in |
| RC-WP-09 | Tight | radius > 0 or rotated | Rotated: axis-aligned rotated bounding box (OD-ROT). Rounded corners: same as Square (rounded contours unsupported until genuinely built). | OD-ROT; spec DP2 | T-WP-09 | in |
| RC-WP-10 | Top and bottom | unrotated and rotated | Full-width band from (rotated) bounds top − distance to bottom + distance; no text beside it. | W-LO; OD-ROT | T-WP-10 | in |
| RC-WP-11 | Behind text | any rotation | Text flow unchanged; painted under the text; selected from Document objects (RC-SEL-13). | W-LO; SPEC-DP4 | T-WP-11 | in |
| RC-WP-12 | In front of text | any rotation | Text flow unchanged; painted over the text; directly clickable. | W-LO | T-WP-12 | in |
| RC-WP-13 | Inline → floating mode | choose any floating mode | Stays where it was on the page; anchors to the paragraph it was in; X/Y appear relative to the default references (Column / Paragraph). | CD (source does not state it; critic phase 2) | T-WP-13 | in |
| RC-WP-14 | Floating → inline | choose In line with text | Becomes a character at the start of its anchor paragraph; floating-only controls disappear; size, rotation, radius and paint kept. | CD (source does not state it; critic phase 2) | T-WP-14 | in |
| RC-WP-15 | Floating ↔ floating mode | e.g. Square → Behind | Position, size and anchor kept; only text flow/plane changes; order within the new plane: on top. | SPEC-DP4 | T-WP-15 | in |
| RC-WP-16 | Anchor marker | floating selected | Anchor icon in the left margin beside the anchored paragraph; tooltip "Anchored to paragraph N"; hidden when deselected. | SPEC-DP3; PROTO | T-WP-16 | in |
| RC-WP-17 | Move with text | text inserted above the anchor | Rectangle moves down with its paragraph (keeps offset). | W-LO; SPEC-DP3 | T-WP-17 | in |
| RC-WP-18 | Fix on page | text inserted above the anchor | Rectangle keeps its page coordinates; the anchor stays associated (not deleted); if the anchor moves to another page, the rectangle moves to that page at the same coordinates. | W-LO; W-WRAP; SPEC-DP3 | T-WP-18 | in |
| RC-WP-19 | Fix on page | vertical reference was Paragraph or Line | Switches the vertical reference to Page, keeping the visual position. | CD (source does not state it; critic phase 2) | T-WP-19 | in |
| RC-WP-20 | Anchor paragraph deleted | delete the paragraph text | Rectangle anchors to the nearest remaining paragraph; it is never deleted silently. | CD (owner's documents never lost) | T-WP-20 | in |
| RC-WP-21 | Horizontal reference | Page / Margin / Column / Character | X measured from that origin; changing it does not move the rectangle (RC-FLD-04). | W-LO | T-WP-21 | in |
| RC-WP-22 | Vertical reference | Page / Margin / Paragraph / Line | Y measured from that origin; same rule. | W-LO | T-WP-22 | in |
| RC-WP-23 | Distances | changed | Text reflows immediately to the new distances. | W-LO | T-WP-23 | in |
| RC-WP-24 | Floating near page edge | dragged partly off the page | Allowed within X/Y bounds; clipped at print by the page; text wrap uses the on-page part. Fully off the page: RC-WP-35. | W-LO (negative positions allowed); CD | T-WP-24 | in |
| RC-WP-25 | Arrange: Bring forward | Ctrl+] / pane / context menu | Moves one step up among floating rectangles in the same plane; text, size and position unchanged. | F-ARPD; W-LO; SPEC-DP4 | T-WP-25 | in |
| RC-WP-26 | Arrange: Bring to front | Ctrl+Shift+] / pane / menu | Top of its plane. | F-ARPD; SPEC-DP4 | T-WP-26 | in |
| RC-WP-27 | Arrange: Send backward | Ctrl+[ / pane / menu | One step down in its plane. | F-ARPD; SPEC-DP4 | T-WP-27 | in |
| RC-WP-28 | Arrange: Send to back | Ctrl+Shift+[ / pane / menu | Bottom of its plane. | F-ARPD; SPEC-DP4 | T-WP-28 | in |
| RC-WP-29 | Arrange shortcuts | focus in text, a field or text editing | Not intercepted; the editor's own bindings apply. | spec (Figma layer-order row) | T-WP-29 | in |
| RC-WP-30 | Arrange | at boundary | Command disabled in pane and menu; shortcut does nothing; no undo step. | SPEC-DP4 | T-WP-30 | in |
| RC-WP-31 | Overlap order | two floating rectangles overlap | Later inserted is on top by default; Behind plane always under text, front plane (Square, Tight, Top and bottom, In front) over text; arrange never moves a rectangle across planes. | W-LO; SPEC-DP4 | T-WP-31 | in |
| RC-WP-32 | Arrange in multi-select | Ctrl+] etc. | Each selected rectangle moves one step keeping their relative order. | F-ARPD | T-WP-32 | in |
| RC-WP-33 | Allow overlap | — | Always on (floating rectangles may overlap); no toggle. | W-LO; CD | T-WP-33 | in |
| RC-WP-34 | Print / PDF | any mode | Prints exactly as on screen (Stage 2 rule). | spec Stage 2 | T-WP-34 | in |
| RC-WP-35 | Floating rectangle | dragged (or typed X/Y) fully off the page, within the CD-03 bounds | Allowed, as Word allows positions off the page; it is **never lost**: it stays in the document, in Document objects and selectable. Off-page parts that fall under another sheet are hidden beneath it while unselected (RC-WP-36); when selected (by Document objects (RC-SEL-13, RC-KB-04), a click on a visible part, or undo/redo of a change to it (RC-UR-33)) its outline and handles draw on top (RC-WP-36) and the canvas scrolls to it. The scrollable canvas grows to include it (a pasteboard around the page), dragging near the viewport edge auto-scrolls the canvas as Figma's canvas does, the pane never covers the scrollable canvas, and choosing it in Document objects selects it and scrolls it into view (RC-SEL-13). Nothing of it prints (RC-WP-24). | [W-LO](https://support.microsoft.com/en-us/word/layout-options) (fetched 15:16: "positive or negative" positions); **CD** for the pasteboard and the auto-scroll near the viewport edge (no fetched page states them; reason: an object placed off the page must stay reachable and a drag must be able to reach it); the [Word move/rotate help page](https://support.microsoft.com/en-us/office/move-rotate-or-group-a-picture-text-box-or-other-object-in-office-4f9df3cb-b2fe-4ec7-8b7e-d6ea2f58d1b4) **could not be fetched** (error page, 15:08); CD (owner's documents never lost; other pages stay legible, critic r4 #1); blind review a12 F6 | T-WP-35 | in |
| RC-WP-36 | Inline or floating rectangle | W wider than the text column, or H taller than the page's text area (W/H allow up to 10 000 px, CD-03) | Never split, never lost, always selectable. Inline wider than the column: sits on its own line at the left indent and runs past the right margin. Inline taller than the page's text area: moves to the top of the next page as any character that does not fit, and runs past the bottom margin; following text continues on the next page. An inline rectangle's **fill, stroke and text are clipped at its own sheet's edges**, as Word clips an oversize inline picture: they are never drawn on the gap between sheets, on the pasteboard or over the next sheet, so the next page stays legible. Floating larger than the page: its off-page parts are drawn on the pasteboard per RC-WP-24 / RC-WP-35 but **beneath** every other sheet (another sheet's paper and text are never covered). In every case only the on-page part prints (RC-WP-34). Selection chrome (outline, all 8 handles, rotate zones, radius dots) is drawn **unclipped, only while selected**, above the page, the gap, the following sheet and the pasteboard, and the canvas scrolls to it (RC-WP-35), so every handle stays reachable and the shape can always be shrunk back by mouse. | [W-LO](https://support.microsoft.com/en-us/word/layout-options) and [W-WRAP](https://support.microsoft.com/en-us/word/training/wrap-text-around-a-picture-in-word) (inline behaves as text); **CD** (W-LO fetched 15:16 does not cover oversize objects, so the clip at the sheet edge is a contract decision following Word layout in use (critic r3 #1); reason: the next page stays legible, the owner rule that documents are never lost holds because the shape is kept whole and only drawn clipped, and chrome is unclipped while selected because a shape must always be resizable by mouse) | T-WP-36 | in |
| RC-WP-37 | Copy made by Ctrl+D (or any duplicate) of a floating rectangle | after the copy is moved, resized or rotated | The copy is a full rectangle with the original's wrap mode, distances, references, position behaviour, plane and anchor (RC-CAN-25): text wraps around **both** the copy and the original by their own (rotated) bounds plus distances (RC-WP-06/07/10), live while either is dragged (RC-FB-05); no glyph box intersects either shape's wrap area. Same for Behind / In front planes (text flow unchanged, painted in the copy's plane). | [W-WRAP](https://support.microsoft.com/en-us/word/training/wrap-text-around-a-picture-in-word) (every shape with a wrap choice has text flowing around it); W-LO; F-SMS (duplicate in place keeps the layer's properties); blind review 12d F3 | T-WP-37 | in |

## 10. Undo and redo

Shared rules (`T-UR-00`): Ctrl+Z undoes; Ctrl+Y **and** Ctrl+Shift+Z redo; each row below is one undo step; undo and redo restore the selection to the affected rectangle(s) and refresh the pane; a new change after undo clears the redo stack; undo never leaves text reflow out of date; drags cancelled with Esc and no-op actions add no step. Sources: W-UNDO (verified), F-ARPD ("undo ... Ctrl Z").

| ID | Control/element | Input/state | Expected behaviour | Source | Test ID | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| RC-UR-01 | Insert rectangle | Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z | Removed / restored at the same character position; undo also restores any text the insert replaced (RC-SEL-21a) and the previous selection (RC-SEL-22); redo replaces it again. One step each way. | W-UNDO; RC-SEL-21; RC-SEL-22 | T-UR-01 | in |
| RC-UR-02 | Delete | same | Restored with text, paint, placement and order / deleted again. **Inline:** Ctrl+Z restores it at the same character offset in the same paragraph even though the caret (and DOM focus) is in the text after the delete, because Ctrl+Z in the document body is the one document undo (only a focused pane field takes it first, RC-UR-30); the restored rectangle is shape-selected; Ctrl+Y / Ctrl+Shift+Z deletes it again. Same for an inline copy made by Ctrl+D, and for Delete from the keyboard, Backspace or the context menu. | W-UNDO; blind review 12d F2 | T-UR-02 | in |
| RC-UR-03 | Duplicate (Ctrl+D) | same | Copy removed / restored. | W-UNDO | T-UR-03 | in |
| RC-UR-04 | Move floating (drag) | same | Position and anchor restored / reapplied. | F-ARPD | T-UR-04 | in |
| RC-UR-05 | Move inline (drag) | same | Character position restored. | W-UNDO | T-UR-05 | in |
| RC-UR-06 | Nudge (each key press) | same | One press per step. | CD | T-UR-06 | in |
| RC-UR-07 | Resize (each handle) | same | W, H, X, Y, clamped radii and any flip from crossing the opposite edge (RC-CLK-27) restored together. | F-ARPD | T-UR-07 | in |
| RC-UR-08 | Rotate (canvas) | same | Angle restored. | F-ARPD | T-UR-08 | in |
| RC-UR-09 | Rotate 90°, flip H, flip V | same | Each one step. | F-ARPD | T-UR-09 | in |
| RC-UR-10 | Radius drag, all corners | same | All four restored. | OD-RAD | T-UR-10 | in |
| RC-UR-11 | Radius drag, one corner (Alt) | same | That corner restored, others untouched. | OD-RAD | T-UR-11 | in |
| RC-UR-12 | Radius dot keys | same | One step per key press. | OD-RAD | T-UR-12 | in |
| RC-UR-13 | Any number-field commit (Enter, Tab, blur, arrow press) | same | Restores the previous value(s), including all values behind Mixed. | OD-NUM | T-UR-13 | in |
| RC-UR-14 | Number-field scrub | same | Whole scrub is one step. | OD-NUM | T-UR-14 | in |
| RC-UR-15 | Lock aspect ratio toggle | same | Toggle restored. | F-ARPD | T-UR-15 | in |
| RC-UR-16 | Independent corners toggle | same | Panel open state is UI only: **no** undo step. | CD | T-UR-16 | in |
| RC-UR-17 | Alignment button | same | Position restored. | F-ARPD | T-UR-17 | in |
| RC-UR-18 | Fill add / remove / hide / show | same | Each one step. | F-FILL | T-UR-18 | in |
| RC-UR-19 | Fill colour (picker release or hex commit) | same | Previous colour. | F-PICK | T-UR-19 | in |
| RC-UR-20 | Stroke add / remove / hide / show / colour / weight / position | same | Each one step. | F-STROKE | T-UR-20 | in |
| RC-UR-21 | Wrap mode change | same | Mode, position and reflow restored. | W-LO | T-UR-21 | in |
| RC-UR-22 | Horizontal / vertical reference | same | Reference restored (position unchanged either way). | W-LO | T-UR-22 | in |
| RC-UR-23 | Move with text / Fix on page | same | Behaviour (and any reference switch from RC-WP-19) restored. | W-LO | T-UR-23 | in |
| RC-UR-24 | Wrap distances | same | Distance restored, text reflows. | W-LO | T-UR-24 | in |
| RC-UR-25 | Arrange (each of 4) | same | Previous order. | F-ARPD | T-UR-25 | in |
| RC-UR-26 | Text typed inside the rectangle | same | Normal text undo granularity of the editor. | spec Stage 1 | T-UR-26 | in |
| RC-UR-27 | Multi-select edits | same | One step for all affected rectangles. | CD-05 | T-UR-27 | in |
| RC-UR-28 | Selection changes only | Ctrl+Z | Selection is not an undo step. | CD (source does not state it; critic phase 2) | T-UR-28 | in |
| RC-UR-29 | Undo after save | Ctrl+Z | Works; autosave writes the undone state ("Saved" means on disk). | W-UNDO; AGENTS.md rule 3 | T-UR-29 | in |
| RC-UR-30 | Ctrl+Z inside a focused field with typed text | Ctrl+Z | Field-local undo first (RC-NF-27). | CD | T-UR-30 | in |
| RC-UR-31 | F4 / Ctrl+Y with an empty redo stack | press | Does nothing: no repeat action; F4 not bound. | W-UNDO; CD | T-UR-31 | in |
| RC-UR-32 | Undo depth | many changes | At least 100 steps per document session. | W-UNDO (100-action default) | T-UR-32 | in |
| RC-UR-33 | Undo across objects | change rectangle A, select rectangle B (click, Document objects, Tab), press Ctrl+Z; then Ctrl+Y | One document-wide history of **actions**; each step records which rectangle(s) it changed and their before/after values. Ctrl+Z reverts the last action **on the rectangle it was made on** (A), selects A and refreshes the pane; B's state stays byte-identical. One rectangle's values are never applied to another, whichever is selected. Ctrl+Y reapplies to A. Duplicates and inserts are their own rectangles with their own entries (RC-UR-01/03). | W-UNDO (Ctrl+Z undoes the last action); F-ARPD ("undo the action"); shared rules above (undo restores the selection to the affected rectangle, selection is not a step, RC-UR-28); blind review 12d F1 | T-UR-33 | in |

## 11. Keyboard and accessibility

| ID | Control/element | Input/state | Expected behaviour | Source | Test ID | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| RC-KB-01 | Selected rectangle | focus | Receives DOM focus with a visible focus ring distinct from the selection outline. | WCAG 2.4.7; design system | T-KB-01 | in |
| RC-KB-02 | Rectangle | accessible name | "Rectangle N, In line with text, k of n" / "Rectangle N, Square, anchored to paragraph M, k of n", where "Rectangle N" is its Document objects name (RC-BTN-24; a Ctrl+D copy shares the original's name, RC-CAN-25) and "k of n" its Document objects position, so every accessible name is unique; role `img`-like group with `aria-roledescription="shape"`. Test asserts the names of an original and its copy differ only in "k of n". | PROTO ("Selected rectangle"); CD (critic r4 #2) | T-KB-02 | in |
| RC-KB-03 | Pane | Tab order | Wrap mode group → alignment ×6 → X → Y → horizontal ref → vertical ref → position behaviour → rotation → rotate 90 → flip H → flip V → W → H → lock → opacity → corner radius → independent corners → TL → TR → BL → BR → fill swatch → fill hex → fill opacity → fill eye → fill − (or +) → stroke same → stroke position → stroke weight → distances T, B, L, R → arrange ×4 → Document objects. Hidden controls are skipped. | SS-PANE order; CD | T-KB-03 | in |
| RC-KB-04 | Keyboard selection | Document objects list | Every rectangle (including behind text) selectable without a mouse. | SPEC-DP4 | T-KB-04 | in |
| RC-KB-05 | Keyboard selection inline | Shift+Arrow over it | Selected as a character (RC-SEL-11); to select it as a shape (handles, pane), choose it in Document objects and press Enter. | W-WRAP; CD | T-KB-05 | in |
| RC-KB-06 | Move | arrows / Shift+arrows | Floating: reachable without mouse (RC-CAN-21/22). Inline: arrow keys move the caret, not the rectangle, as in Word (RC-CAN-23). Moving an inline rectangle to another point in the text by keyboard alone is **not available in this slice** (CD-14, RC-OS-40): Word does it by cut and paste, which waits for the clipboard slice (RC-OS-25). A keyboard user can still change its wrap mode to a floating one and nudge it (RC-CAN-21/22); making it inline again puts it at the start of its anchor paragraph (RC-WP-14). No other move command is added. | F-ARPD; W-KBD; conflict 13; CD-14 | T-KB-06 | in |
| RC-KB-07 | Resize | W / H fields | Reachable without mouse. | F-ARPD | T-KB-07 | in |
| RC-KB-08 | Rotate | rotation field, rotate 90 | Reachable without mouse. | F-ARPD | T-KB-08 | in |
| RC-KB-09 | Radius | radius dot focus and pane fields; Tab / Shift+Tab / Esc | Reachable; dots are `role="slider"` with `aria-valuemin/max/now` and name "Top-left corner radius". Tab order follows the **corner names** in the rectangle's own frame (RC-CLK-36), whatever the rotation or flip, so it matches the pane fields: rectangle → TL → TR → BR → BL dot → first visible pane control (RC-KB-03); Shift+Tab reverses (BL → BR → TR → TL → rectangle); Shift+Tab from the rectangle moves focus to the **Document objects** list (the last pane control in RC-KB-03) with the rectangle still selected and marked there, never into the text; Tab from the Document objects list returns focus to the selected rectangle, so focus cycles rectangle → dots → pane → rectangle. When the dots are hidden (CD-12) or several rectangles are selected (CD-05) they are skipped: rectangle → pane. Esc on a dot returns focus to the rectangle, which stays selected (then RC-KB-12). | OD-RAD; PROTO; [WAI-ARIA APG slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/) (fetched 15:17: slider role and values); **CD** for the Tab order and Esc (Figma has no dot focus; reason: consistency with the corner names (RC-CLK-36), which is clockwise on screen only when unrotated and unflipped; then the pane as RC-OS-35 says) | T-KB-09 | in |
| RC-KB-10 | Wrap, references, behaviour, arrange, paint | pane | All reachable; arrange also via Ctrl+]/[ shortcuts. | SPEC-DP2–DP4 | T-KB-10 | in |
| RC-KB-11 | Context menu | Shift+F10 / Menu key on a selected rectangle | Opens the same menu; arrows move; Enter runs; Esc closes. | WCAG; CD | T-KB-11 | in |
| RC-KB-12 | Return to the document | Esc chain | Field → rectangle → deselect with caret in text (RC-SEL-05). | CD-11 | T-KB-12 | in |
| RC-KB-13 | Pane controls | accessible names | Match the visible tooltip names (e.g. "Width", "Wrap distance top", "Bring forward"). | PROTO aria-labels; ui-copy | T-KB-13 | in |
| RC-KB-14 | Values changed by drag | screen reader | Pane fields expose the new value; a polite live region announces the committed value once per drag ("Width 240"). | CD (labels are off-canvas, OD-LBL) | T-KB-14 | in |
| RC-KB-15 | Contrast | chrome, handles, dots, focus | Meet 3:1 non-text contrast in light, dark and contrast themes. | WCAG 1.4.11; design system | T-KB-15 | in |
| RC-KB-16 | Reduced motion | any | No animated transitions on chrome when reduced motion is set. | design system | T-KB-16 | in |
| RC-KB-17 | Pane section headings and sub-labels | any | Use the reference words a writer knows: Position, Layout, Appearance, Fill, Stroke, Text wrapping, Arrange, Document objects; the alignment sub-label names the current reference in Word's terms ("Align to page", "Align to margin", "Align to column"); no implementation terms (canvas, frame, node, layer, DOM) and no "·"-joined jargon such as "Alignment · canvas frame". | [copy-glossary](../design/copy-glossary.md) (Word's page/margin terms; "Don't say" column); W-LO reference names; ui-copy; blind review a12 F3 | T-KB-17 | in |
| RC-KB-18 | Help and hint text in the pane | any | Every help string describes current behaviour and contradicts no built feature: e.g. independent corners are described as available (RC-BTN-12), and scrubbing is described as dragging the field itself (or its label), not only the X/Y/W/H labels (RC-NF-02/08). A test checks each string against the feature it names. | ui-copy; copy-glossary; OD-NUM; blind review a12 F4 | T-KB-18 | in |
| RC-KB-19 | Text over a behind-text or in-front rectangle | light, dark and contrast appearance (page colour per RC-KB-22) | Text in Automatic colour drawn over a rectangle's fill switches between the light and dark text colour so it keeps at least 4.5:1 against that fill, as Word's Automatic font colour does over shading; text with an authored colour is drawn as authored. | WCAG 1.4.3; **CD** (source not confirmed: the [Word dark mode help page](https://support.microsoft.com/en-us/office/dark-mode-in-word-for-windows-a2db4d3a-5bd1-4b9c-a4c2-7ac5f8ddbe2d) **could not be fetched**, 404, 15:09, and the [Word font colour page](https://support.microsoft.com/en-us/office/change-the-font-color-1aa5ff28-4a11-4b4c-8ef5-c4d0d7a4b3e5) **could not be fetched**, 404, 15:16; reason: Word's Automatic colour is known to switch over dark shading, and text must stay readable in every appearance); blind review a12 F5 | T-KB-19 | in |
| RC-KB-20 | Delete, Backspace, Ctrl+D, Shift+H / Shift+V, Enter, Esc, arrow keys, Home / End, printable keys | focus in any pane input (number or hex), select, radio group, toggle, colour picker, context menu or the Document objects list | Handled by that control only (edit its text, move between options, close the menu, etc.); never deletes, duplicates, flips, nudges, resizes the radius of, or enters text editing on the rectangle. Backspace in the W field edits the field. Esc follows the control's own rule first (RC-NF-10, RC-CLK-06, RC-COL-04). Ctrl+Z / Ctrl+Y follow RC-NF-27 and RC-UR-30 (field-local first); arrange shortcuts follow RC-WP-29. | **CD** (source does not state it: the F-KBD page fetched 15:16 does not say how shortcuts behave while a field has focus). Reason: a key typed into a field must never change the document behind it; the owner's content is never lost by a stray key. | T-KB-20 | in |
| RC-KB-21 | Rectangle fill, stroke and inner text; selection chrome | light, dark, contrast themes and Windows forced-colors (high contrast) | The authored fill, stroke and text colour are document content and render identically in every theme (only RC-KB-19's Automatic text adapts). The insert default (CD-08) writes the shape-fill token's **light-theme value** into the document as a fixed colour, not a live token, so a document looks the same on any computer. Selection outline, handles, radius dots, hover outline, anchor marker and focus ring use chrome tokens per theme (rest, hover, pressed, focus); in forced-colors they map to system colours (`Highlight` for selection and focus, `CanvasText` for outlines) and stay visible. | [F-THEME](https://help.figma.com/hc/en-us/articles/5576781786647-Change-the-theme-of-Figma) (fetched 15:16: theme changes the interface only, does not change what others see in the file; contrast mode covers outlines and selections); design system; the Word dark mode page could not be fetched (404, 15:09); **CD** for forced-colors mapping and the stored default (reason: documents must print and sync the same everywhere) | T-KB-21 | in |
| RC-KB-22 | Page (paper) and the canvas around it | light, dark and contrast themes and Windows forced-colors | The page is drawn in the document's **page colour** (white unless set in Page setup, U14) in every theme and in forced-colors, so a rectangle, its fill and the text over it look on screen as they print (RC-WP-34); only the surrounding canvas (the grey area between sheets and the pasteboard, RC-WP-35) and the app chrome follow the theme. RC-KB-19 and RC-KB-21 are tested against this page colour. | spec U14 and "Pages" (page colour is a document setting, owner decision); [W-PAGE](https://support.microsoft.com/en-us/word/add-change-or-delete-the-background-color-in-word) (fetched 15:26: page colour is set under Design > Page Color and removed with No Color, i.e. it belongs to the document); [F-THEME](https://help.figma.com/hc/en-us/articles/5576781786647-Change-the-theme-of-Figma) (fetched 15:16: theme changes the interface, not the file's content); the Word dark mode page could not be fetched (404, 15:09), so Word's dark-mode page behaviour is not cited; **CD** for forced-colors (reason: print matches screen, and a theme never changes the document) | T-KB-22 | in |

## 12. Feedback on the canvas

| ID | Control/element | Input/state | Expected behaviour | Source | Test ID | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| RC-FB-01 | Selection outline and handles | selected | Shown. | F-ARPD | T-FB-01 | in |
| RC-FB-02 | Hover outline | hover unselected | Shown. | F-SEL | T-FB-02 | in |
| RC-FB-03 | Radius dots | hover / focus | Dot grows and fills; geometry unchanged. | OD-RAD | T-FB-03 | in |
| RC-FB-04 | Inline drag | dragging | Insertion caret at the drop boundary; ghost of the rectangle under the pointer. | W-WRAP; SPEC-DP1 | T-FB-04 | in |
| RC-FB-05 | Live reflow | any drag or field change | Text reflows live, not only on release. | SPEC-DP2 | T-FB-05 | in |
| RC-FB-06 | Anchor marker | floating selected | Shown (RC-WP-16). | SPEC-DP3 | T-FB-06 | in |
| RC-FB-07 | W × H badge | any | **Not shown.** | OD-LBL | T-FB-07 | in |
| RC-FB-08 | Radius badge | any | **Not shown.** | OD-LBL | T-FB-08 | in |
| RC-FB-09 | X/Y or angle badge | move / rotate | **Not shown** (same rule; values in the pane). | OD-LBL; CD | T-FB-09 | in |
| RC-FB-10 | Smart guides / distance lines | any drag | Not shown (CD-06). | CD-06 | T-FB-10 | in |
| RC-FB-11 | Wrap distance boundary | selected | Not shown (Word does not draw it). | W-LO; CD | T-FB-11 | in |
| RC-FB-12 | Scrub | scrubbing | No on-canvas readout; pane field shows the value; no speed toast. | OD-LBL; CD-10 | T-FB-12 | in |
| RC-FB-13 | Save sign | after any change | Status shows "Saving…" then "Saved to this computer". | AGENTS.md rule 3; spec Stage 1 | T-FB-13 | in |
| RC-FB-14 | Disabled arrange at boundary | pane | Disabled look, not hidden. | SPEC-DP4 | T-FB-14 | in |
| RC-FB-15 | Demo / fixture document | first start, light and dark | The seeded rectangles' own text never sits on top of body text (behind-text examples are placed in a margin or blank line, or carry no text), so every line on the demo page stays legible; real documents keep Word's behaviour (behind-text text may overlap). | CD (review build demo data); blind review a12 F5 | T-FB-15 | in |

## 13. Out of scope (explicit, each with a reason)

| ID | Control/element | Input/state | Expected behaviour | Source | Test ID | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| RC-OS-01 | Marquee selection | drag on empty area | Not built: the page is text first; drag selects text (CD-04). | F-SEL | T-OS-01 (asserts absence) | out |
| RC-OS-02 | Alt+drag to duplicate | Alt+drag body | Not built: Alt is reserved for centre-resize and one-corner radius; Ctrl+D duplicates. | F-KBD | T-OS-02 (asserts plain move) | out |
| RC-OS-03 | Snapping and smart guides (Snap to objects, pixel grid, Ctrl to disable) | any drag | Not built in this slice: not in DP1–DP4; needs its own target set (margins, columns, paragraphs) and matrix (CD-06). | F-ARPD snap settings | T-OS-03 | out |
| RC-OS-04 | Rotation origin (Alt+R) | — | Not built: rotation is always about the centre; Word has no movable origin. | F-ARPD | — | out |
| RC-OS-05 | Scrub speeds (2x, 1x, 1/2, 1/4 by vertical position) and speed toast | scrub | Not built: Shift ×10 covers coarse changes; the toast would be extra on-screen feedback. | F-ARPD scrub | — | out |
| RC-OS-06 | Alt-hover to scrub over the field | — | Superseded: P-Doc scrubs from the field itself without a modifier (OD-NUM). | F-ARPD; OD-NUM | — | out |
| RC-OS-07 | Corner smoothing (squircles) | — | Not built: Word has no equivalent; wrap contours would need it. | F-CR | — | out |
| RC-OS-08 | Vector edit mode / per-point radius | Enter / double-click | Enter and double-click edit text instead (CD-11). | F-CR | — | out |
| RC-OS-09 | Multiple fills / strokes and reorder | — | One of each (CD-07). | F-FILL | T-COL-19 | out |
| RC-OS-10 | Gradient, pattern, image, video fills | picker fill type | Solid only in this slice; others need print and file-format work. | F-FILL | — | out |
| RC-OS-11 | Eyedropper | picker | Not built: needs screen sampling permissions in Electron. | F-PICK | — | out |
| RC-OS-12 | Blend modes (layer and paint) | — | Not built and not rendered: Word has no blend modes; no inert control (RC-BTN-25). | F-PICK; SS-PANE | — | out |
| RC-OS-13 | Colour styles, variables, libraries, colour models other than HEX | picker | Not built: no design-library concept in documents yet. | F-PICK | — | out |
| RC-OS-14 | Contrast checker in picker | — | Not built in this slice. | F-PICK | — | out |
| RC-OS-15 | Individual stroke sides, dashes, caps, width profiles | — | Not built: rectangle strokes are uniform in this slice. | F-STROKE | — | out |
| RC-OS-16 | Effects (shadow, blur) and Export sections | — | Not built and not rendered: not needed for document shapes yet. | SS-PANE; F-PANEL | — | out |
| RC-OS-17 | Figma Alt+letter alignment shortcuts | Alt+A/D/H/W/S/V | Not bound: conflict with menu-bar access keys (CD-09). | F-ARPD | — | out |
| RC-OS-18 | Distribute, tidy up, smart selection | — | Not built: needs combined-bounds multi-select (CD-05). | F-ARPD | — | out |
| RC-OS-19 | Combined-bounds resize / rotate / radius on multi-selection | — | Not built (CD-05). | F-SEL | — | out |
| RC-OS-20 | Layers panel drag reorder, Select layer submenu, deep select | — | Replaced by the Document objects list and arrange commands. | F-SEL; F-ARPD | — | out |
| RC-OS-21 | Lock anchor; dragging the anchor marker to another paragraph | — | Not in U114.P2; the anchor is shown and reassigns on move; locking is a later slice. | W-LO | — | out |
| RC-OS-22 | Book layout (Inside/Outside), relative (percentage) positions, Left/Right margin references | — | Not in DP3; absolute position against Page, Margin, Column, Character / Page, Margin, Paragraph, Line only. | W-LO | — | out |
| RC-OS-23 | Wrap points (Edit wrap points), Through wrap, text-only-on-one-side options | — | Not in DP2; six modes only. | W-WRAP; W-LO | — | out |
| RC-OS-24 | Rounded-contour Tight wrap | — | Unsupported until genuinely implemented; Tight = Square for rounded rectangles (RC-WP-09). | spec DP2 | — | out |
| RC-OS-25 | Copy, cut, paste of rectangles | Ctrl+C/X/V; Cut / Copy / Paste in the rectangle context menu | Native clipboard is UNKNOWN in the spec; separate slice. Ctrl+D covers duplication. Figma's and Word's context menus lead with Cut / Copy / Paste; P-Doc's rectangle menu leaves them out (not rendered) until that slice (RC-CLK-05). | spec ("native clipboard UNKNOWN"); blind review 12d F7 | — | out |
| RC-OS-26 | Group / ungroup, constraints, auto layout, components | — | Not document concepts in this slice. | F-PANEL | — | out |
| RC-OS-27 | Ctrl+drag copy (Word) / Ctrl snap toggle (Figma) | Ctrl+drag | Ctrl+drag = plain drag (CD-13). | W-LO; F-ARPD | T-CLK-15 | out |
| RC-OS-28 | Configurable nudge amounts | preferences | Fixed 1 / 10 (OD-NUM). | F-ARPD | — | out |
| RC-OS-29 | Typing over a selected rectangle replaces it (Word) | printable key | Protected instead (RC-CAN-29): the owner's content is never lost by a stray key. | CD | T-CAN-29 | out |
| RC-OS-30 | Other units (in, cm, pt, mm) in shape fields | typed unit | Rejected; unit conversion is a separate decision tied to the page-setup locale. | CD-03 | T-NF-18 | out |
| RC-OS-31 | Figma-style flip on dragging past the opposite edge | handle drag | **Withdrawn (blind review a12 F1):** flip-through is now in scope as RC-CLK-27. Row kept so the ID is never reused; not counted as out of scope. | blind review a12 F1 | T-CLK-27 | withdrawn |
| RC-OS-32 | Pane tabs (Design / Prototype), zoom dropdown, component/boolean/mask header buttons | SS-PANE header | Not in a document editor; pane header shows "Rectangle" only. | SS-PANE | — | out |
| RC-OS-33 | Rectangle tool, R key, drag-to-draw (Shift square, Alt from centre) | — | Not built: insert is at the caret, inline (OD-INL); a drawn shape would have to be floating. | F-SHAPE | — | out |
| RC-OS-34 | Word's Layout Options button beside the selected object | — | Not built: wrap is chosen in the pane (RC-BTN-05); keeps on-canvas chrome minimal (OD-LBL spirit). | W-WRAP | — | out |
| RC-OS-35 | Tab / Shift+Tab next/previous object, Shift+Enter select parent | — | Not built: Tab moves focus (dots, then pane) for keyboard access; objects are reached via Document objects (RC-KB-04). | F-SEL | — | out |
| RC-OS-36 | Relative size (% of page/margin), Scale %, Reset size | — | Not built: absolute W/H only; percentage sizing needs a page-setup decision. | W-LO Size tab | — | out |
| RC-OS-37 | Position presets gallery (Top Left … Bottom Right with text wrapping) | — | Not built: alignment buttons and references cover it (RC-BTN-06/07). | W-WRAP | — | out |
| RC-OS-38 | Modal Layout dialog with OK / Cancel | — | Replaced by the live pane; undo replaces Cancel. | W-LO | — | out |
| RC-OS-39 | Touch, pen and pinch-zoom on rectangles and their chrome | touch, pen, pinch | Not built in this slice: P-Doc is desktop mouse and keyboard first; no touch-sized handles or gestures. Pointer events must not break: a pen acts as a mouse (hover, press, drag, release), and touch does nothing harmful. | **CD** (no source decides scope; reason: not in DP1–DP4 and needs its own matrix) | T-OS-39 (pen = mouse smoke test) | out |
| RC-OS-40 | Keyboard-only move of an inline rectangle to a chosen point in the text | keyboard only | Not built in this slice (CD-14): in Word an inline object moves by keyboard with cut and paste (Ctrl+X, then Ctrl+V at the new caret position), and clipboard for rectangles is a separate slice (RC-OS-25). Accepted, named limit against WCAG 2.1.1 for this slice. **Follow-up:** the clipboard slice must make Ctrl+X / Ctrl+V on a shape-selected inline rectangle move it to the caret as one undo step, and this row then becomes in scope with T-OS-40. | [W-KBD](https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-word-95ef89dd-7142-4b50-afb2-f762f663ceb2) (fetched 15:16: Ctrl+X cut and Ctrl+V paste, arrow keys move the cursor); [WCAG 2.1.1](https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html); CD-14 | T-OS-40 (reserved for the clipboard slice) | out |

## Conflicts resolved in this contract

1. Spec 13:29 "Show live Radius N" vs 14:29 "no Radius labels": 14:29 wins (the spec says so); RC-FB-08.
2. Radius dot keys (10 / Shift 100, 13:29) vs pane fields (1 / Shift 10, 14:29): both kept, as the spec states: the rule governs pane fields; dots keep their own steps (RC-CAN-20 vs RC-NF-13).
3. Figma scrubs from the label or with Alt over the field; P-Doc scrubs from the field itself (OD-NUM); the label also scrubs (RC-NF-08).
4. Figma shows dimension labels under the selection (F-ARPD, SS-RAD); removed by OD-LBL.
5. Mixed + arrow: today's prototype sets all corners to max+1 / min−1; the contract applies the step to each value (CD-02), matching Figma's `Mixed+N`.
6. Word's Ctrl+D is the Font dialog; here Ctrl+D duplicates only while a rectangle is selected and not in text editing (RC-CAN-25).
7. Rotation: Word uses whole degrees and clockwise positive in its Size tab; Figma's convention (counter-clockwise positive, 2 decimals) wins for the pane (CD-01). A future .docx export must convert the sign and round (RC-FLD-05).
8. Left/Right in a radius field: Figma nudges the radius; here Left/Right move the text caret in every field so all fields behave alike (RC-NF-31).
9. Ctrl+D placement: the first draft offset the copy +10/+10 px (CD); Figma's "Duplicate Selection in Place" wins, so the copy lands in place (RC-CAN-25).
10. Radius dots: Figma reveals them on hover over a corner (F-CR); the owner screenshot (SS-RAD) shows them whenever the rectangle is selected, so they are always shown when large enough (RC-SEL-09, CD-12).
11. Resize past the opposite edge: the critic-phase draft stopped at 1 px with no flip (CD); blind review a12 showed Figma (and Word for shapes) flip, and no owner decision says otherwise, so Figma wins for shape editing (RC-CLK-27; RC-OS-31 withdrawn).
12. Blend mode: the a12 review suggested Figma's Appearance-header blend icon; blend stays out (RC-OS-12, no inert controls in SPEC-DP4), so no blend control is rendered anywhere (RC-BTN-25).
13. Arrow keys on an inline rectangle: the earlier draft moved it one character or line (sourced W-WRAP, which does not say so); Word treats it as a character and the arrows move the caret (W-KBD), and no owner decision in the spec or interaction rules says otherwise, so Word wins for text flow (RC-CAN-23, RC-KB-06). Keyboard-only moving of an inline rectangle within the text waits for clipboard (CD-14, RC-OS-40); until then a keyboard user can only float and nudge it (RC-OS-25).
14. Mixed paint slot (a fill or stroke on only some selected rectangles): Figma's help pages (F-FILL, re-fetched 15:26) document + and − but no Mixed paint state; Figma's in-app behaviour (+ replaces the mixed paints with one, observed, not in any fetched page) is unverified and would overwrite paints. The contract keeps + adding only where missing and − removing from all, with no detail fields shown (RC-BTN-26). Reason: + never overwrites a writer's paint, and no field edits a paint that doesn't exist.
15. Corner names after a flip: the round-1 draft swapped stored radii on flip (CD). Figma treats a flip as a matrix transform like rotation (F-ARPD, fetched 15:27), so Figma now wins for shape editing: flip and rotation never rename corners or swap radii (RC-CLK-36). No deviation remains.
16. Fill header icons: the Figma pane reference (SS-PANE) shows a styles-and-variables icon and + in the Fill header (blind review 12d F8). Styles and variables are out (RC-OS-13) and no inert control is rendered (RC-BTN-25, SPEC-DP4), and one fill per rectangle shows + only when empty (CD-07), so the header shows the heading and, when empty, + only (RC-BTN-21). Cut / Copy / Paste in the context menu (12d F7) likewise wait for the clipboard slice (RC-OS-25, RC-CLK-05).

## What today's prototype lacks against this contract (read-only scan of `rectangle-preview.html`)

No undo/redo; no Delete, Ctrl+D, Enter-to-edit-text or Esc-to-deselect chain found; no maths expressions in fields; Mixed arrow behaviour differs (conflict 5); blend-mode control present (must be removed, RC-BTN-25); cursors use `pointer` and `not-allowed` in places (RC-PTR-18/19); no evidence of a hover outline, Shift-axis drag or 15° snap verification. These are build items, not contract changes.

## Row counts

| Section | Rows |
| --- | --- |
| 1 Pointer: cursors | 21 |
| 2 Pointer: clicks and drags | 37 |
| 3 Selection | 22 |
| 4 Canvas editing | 35 |
| 5 Number fields, shared | 32 |
| 6 Number fields, each | 24 |
| 7 Buttons and toggles | 26 |
| 8 Fill, stroke, colour | 21 |
| 9 Word placement | 37 |
| 10 Undo and redo | 33 |
| 11 Keyboard and accessibility | 22 |
| 12 Feedback | 15 |
| 13 Out of scope | 40 (RC-OS-31 withdrawn) |
| **Total** | **365** |

## Changelog

**2026-10-30 14:50, critic phase 2 folded in** (`rectangle-critic-checklist.md`, "Gaps" and "Verified/corrected"). Existing IDs are unchanged; new IDs are appended.

- **Added (12 rows):** RC-SEL-19 (G-03), RC-NF-31 (G-07), RC-COL-20 out (G-08), RC-COL-21 (G-09), RC-UR-31 and RC-UR-32 (G-13), RC-OS-33 (G-01), RC-OS-34 (G-02), RC-OS-35 (G-04), RC-OS-36 (G-05), RC-OS-37 (G-10), RC-OS-38 (G-11).
- **Changed (15 rows):** RC-CLK-05 (adds flips to the context menu, G-12); RC-CAN-25 (Ctrl+D duplicates in place, source F-SMS); RC-CLK-22 and RC-CLK-23 (source F-SHAPE, verified); RC-CLK-26 (F-ARPD + CD); re-marked CD: RC-CLK-13, RC-PTR-09, RC-COL-04, RC-FLD-04, RC-WP-13, RC-WP-14, RC-WP-19, RC-SEL-17, RC-UR-28, RC-OS-31; RC-UR-29 (now sourced by W-UNDO).
- **Source key:** added F-SHAPE and F-SMS; W-UNDO marked verified; F-KBD narrowed to the Delete/Backspace key (RC-CAN-24 and RC-PTR-18 stay needs-verify).
- **Conflicts:** added 7–10 (rotation convention G-06, radius Left/Right, Ctrl+D in place, radius dots always shown).
- **New totals:** 345 rows (was 333); out of scope 41 (38 in section 13, plus RC-CAN-31, RC-COL-19 and RC-COL-20), was 34.

**2026-10-30 15:10, blind review a12 folded in** (source: contract-blind adversarial review a12, verdict PASS, findings F1–F6, all minor). Existing IDs and test IDs are unchanged; new IDs are appended. Figma pages were re-fetched; the Word move/rotate page returned an error page and the Word dark-mode page a 404, which the source cells say.

- **Added (5 rows):** RC-WP-35 / T-WP-35 floating rectangle fully off the page stays reachable (F6); RC-KB-17 / T-KB-17 pane headings and the alignment sub-label in glossary words, no "Alignment · canvas frame" (F3); RC-KB-18 / T-KB-18 help text matches behaviour (F4); RC-KB-19 / T-KB-19 Automatic text keeps 4.5:1 over a rectangle's fill in every appearance (F5); RC-FB-15 / T-FB-15 demo shapes' text never sits on body text (F5).
- **Changed (10 rows):** RC-CLK-27 now flips through the opposite edge, W/H stay positive (F1, reverses the earlier CD); RC-OS-31 withdrawn (scope `withdrawn`, ID kept); RC-UR-07 resize undo includes the flip; RC-CLK-31 and RC-CLK-32 canvas radius drag yields whole numbers (F2); RC-BTN-08 Rotate 90° is icon-only (F3); RC-NF-18 unit follows the value (`100%`) (F3); RC-BTN-21 + not rendered (not dimmed) while a fill/stroke exists (F3); RC-BTN-25 no blend control anywhere, including the Appearance header (F3; the review's suggestion is declined per RC-OS-12); RC-WP-24 points to RC-WP-35.
- **Conflicts:** added 11 (flip-through) and 12 (blend placement).
- **New totals:** 350 rows (was 345); in scope 309 (was 304); out of scope 40 (37 in section 13, plus RC-CAN-31, RC-COL-19 and RC-COL-20), was 41; withdrawn 1 (RC-OS-31).

**2026-10-30 15:20, critic recheck 8e44 folded in** (`critic-recheck-8e44.json`, verdict GAPS, 13 findings). Existing IDs and test IDs are unchanged; new IDs are appended. Sources were fetched 15:16–15:17; where a page does not state the behaviour, or could not be fetched, the row is now an explicit **CD** with its reason (no in-scope row keeps "needs verify").

- **Added (10 rows):** RC-BTN-26 / T-BTN-26 Mixed for every non-number control (finding 1); RC-SEL-20 / T-SEL-20 pane with no shape selected (2); RC-NF-32 / T-NF-32 precision and rounding (3); RC-KB-20 / T-KB-20 key routing while focus is in the pane (5); RC-CLK-36 / T-CLK-36 radius dots and handles on rotated or flipped rectangles, corner names after flip (6); RC-KB-21 / T-KB-21 themes and forced-colors, authored colours unchanged (7); RC-WP-36 / T-WP-36 rectangle larger than the column or page (9); RC-SEL-21 / T-SEL-21 insert entry points, selection, nesting, page end, default size (11); RC-CLK-37 / T-CLK-37 right/middle-click, wheel and second button on chrome (12); RC-OS-39 / T-OS-39 touch, pen and pinch out of scope (13).
- **Changed (9 rows):** RC-CAN-23 now follows Word: arrows move the caret, the inline rectangle never moves (4, conflict 13); RC-KB-06 inline keyboard move follows RC-CAN-23; RC-KB-09 Tab / Shift+Tab / Esc order for radius dots (8); re-sourced as CD with reasons (10): RC-CAN-24, RC-PTR-18, RC-CLK-27, RC-WP-35 (auto-scroll and pasteboard), RC-KB-19 (Word font colour page also 404); CD-08 gains the 200 × 120 px default size and a stored (not live-token) fill colour.
- **Source key:** F-KBD rewritten from the fetched page (no Delete key, no focus rule); added F-THEME, W-KBD, W-INS.
- **Conflicts:** added 13 (inline arrow keys: Word wins; no owner decision in the spec or `interaction-rules.md` says otherwise).
- **New totals:** 360 rows (was 350); in scope 318 (was 309); out of scope 41 (38 in section 13, plus RC-CAN-31, RC-COL-19 and RC-COL-20), was 40; withdrawn 1 (RC-OS-31).

**2026-10-30 15:28, critic recheck 8e44 round 2 folded in** (`critic-recheck-8e44-r2.json`, verdict GAPS, 9 findings). Existing IDs and test IDs are unchanged; new IDs are appended. Fetched 15:26–15:27: F-CR, F-FILL, F-ARPD (flip section), FigJam resize/rotate/flip, W-PAGE; the Word dark mode page stays unfetchable (404, 15:09) and is not cited for behaviour.

- **Added (3 rows):** RC-SEL-22 / T-SEL-22 insert with rectangles shape-selected never replaces a shape: inline → right after it, floating → inline at the start of its anchor paragraph (finding 3); RC-KB-22 / T-KB-22 the page keeps the document's page colour (white by default) in every theme, only the canvas around it follows the theme (8); RC-OS-40 / T-OS-40 out: keyboard-only move of an inline rectangle within the text waits for clipboard, with the follow-up (9).
- **Changed (10 rows):** RC-BTN-26 drops Independent corners (pane state, never Mixed; differing corners show Mixed in the Corner radius field) and fully defines the Mixed paint slot: only + (adds where missing) and − (removes from all), detail fields not rendered, one undo step each (1, 4); RC-COL-01 and RC-COL-13 store the token's light-theme value as a fixed hex (2); RC-UR-01 undo restores replaced text and the previous selection (3); RC-CLK-36 now follows Figma: flip and rotation never rename corners or swap radii, one reason for both (5); RC-KB-09 Shift+Tab from the rectangle goes to the Document objects list (6); RC-WP-36 selection chrome drawn unclipped, off-page parts shown on screen and not printed (7); RC-KB-19 points to RC-KB-22 for the page colour (8); RC-KB-06 names the limit and points to CD-14 / RC-OS-40 (9).
- **Contract decisions:** added CD-14 (keyboard move of an inline rectangle waits for clipboard; no invented command).
- **Source key:** added W-PAGE.
- **Conflicts:** 13 reworded to point to CD-14; added 14 (Mixed paint slot vs unverified Figma in-app behaviour) and 15 (flip no longer swaps radii; Figma wins).
- **New totals:** 363 rows (was 360); in scope 320 (was 318); out of scope 42 (39 in section 13, plus RC-CAN-31, RC-COL-19 and RC-COL-20), was 41; withdrawn 1 (RC-OS-31).

**2026-10-30 15:33, critic recheck 8e44 round 3 and blind review 12d folded in** (sources: `critic-recheck-8e44-r3.json`, verdict GAPS, 4 findings; contract-blind review of build 12d, `blind-review-12d/report.json`, verdict FAIL, F1–F8). Existing IDs and test IDs are unchanged; new IDs are appended. F-ARPD re-fetched 15:33 (rotation wrap quoted; nothing on invalid input, huge values or feedback, so those are CDs); the Word layout page does not cover oversize inline objects, so the RC-WP-36 clip is a CD.

- **Added (2 rows):** RC-UR-33 / T-UR-33 undo is per action on the rectangle it changed, never applied to the selected one (12d F1); RC-WP-37 / T-WP-37 a Ctrl+D copy wraps text like the original after it is moved (12d F3).
- **Changed (13 rows):** RC-WP-36 inline fill, stroke and text clipped at its own sheet, floating off-page parts beneath other sheets, chrome unclipped only while selected (r3 #1); RC-SEL-21 (a) a text selection containing an inline rectangle is replaced as text, undo restores it (r3 #2); RC-SEL-22 reason narrowed to shape-selected rectangles, "first" = first in document order, ties by z-order (r3 #2, #3); RC-KB-09 Tab follows corner names whatever the rotation or flip (r3 #4); RC-UR-02 inline delete undoes with the caret in the text, redo deletes again (12d F2); RC-CAN-25 the copy carries every property incl. wrap mode and distances (12d F3); RC-FLD-05 rotation normalised by whole turns (400 → 40, −190 → 170), `°` right after the value (12d F4, F8); RC-NF-16 `1e9`, `2in`, `10mm`, `abc` revert quietly, no message (12d F5); RC-NF-17 digits/maths beyond the bound clamp (`10^9` → 10000), rotation wraps (12d F5); RC-NF-32 scrub counts whole px, whole values stay whole (12d F6); RC-CLK-05 no Cut / Copy / Paste items until the clipboard slice (12d F7); RC-OS-25 names the context-menu items (12d F7); RC-BTN-21 Fill / Stroke header shows the heading and + only, no styles icon (12d F8).
- **Conflicts:** added 16 (Fill header styles icon and context-menu clipboard items declined, with reasons).
- **New totals:** 365 rows (was 363); in scope 322 (was 320); out of scope 42 (39 in section 13, plus RC-CAN-31, RC-COL-19 and RC-COL-20), unchanged; withdrawn 1 (RC-OS-31).

**2026-10-30 15:45, critic recheck 8e44 round 4 folded in** (source: `critic-recheck-8e44-r4.json`, verdict GAPS, 3 findings). Existing IDs and test IDs are unchanged; no rows added. Figma's copy-and-paste and rename-layers pages fetched 15:45: neither states a duplicate's name, so the copy keeps the original's name as Figma does in use (observed) and no conflict is recorded.

- **Changed (5 rows):** RC-WP-35 "never lost" (stays in the document, in Document objects and selectable; hidden beneath another sheet only while unselected; outline and handles on top and the canvas scrolls to it when selected), consistent with RC-WP-36 (r4 #1); RC-CAN-25 the copy keeps the original's name (r4 #2); RC-BTN-24 naming rule ("Rectangle N", N = 1 + highest), document order with ties back to front, copy listed after its original, "k of n" positions, testable (r4 #2); RC-KB-02 accessible name ends "k of n" so every name is unique (r4 #2); RC-NF-16 focus after a quiet revert follows the commit key as for valid input (RC-NF-09 / 11 / 12) (r4 #3).
- **New totals:** 365 rows, unchanged; in scope 322; out of scope 42 (39 in section 13, plus RC-CAN-31, RC-COL-19 and RC-COL-20); withdrawn 1 (RC-OS-31).

**2026-10-30 15:43, critic recheck 8e44 round 5 folded in** (source: critic r5): RC-WP-35 names the ways an off-page rectangle is selected (Document objects RC-SEL-13 / RC-KB-04, a click on a visible part, undo/redo of a change to it RC-UR-33); no rows added, totals unchanged (365).
