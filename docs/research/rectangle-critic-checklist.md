# Rectangle critic checklist

Independent reference list of behaviours a rectangle in a Figma-style editor placed in a Word-style document should have. Built by the completeness critic from the official docs (fetched 2026-10-30) before reading the behaviour contract. One behaviour per line, with its source.

## Owner decisions (required)

- **OWN-1** New rectangles are inline (In line with text) by default; inline shows no X/Y fields and no alignment controls. — owner decision (coordinator brief, 2026-10-30)
- **OWN-2** No on-canvas size label and no on-canvas radius label (Figma's blue W x H / radius tooltips are deliberately dropped). — owner decision (coordinator brief, 2026-10-30)
- **OWN-3** Clicking outside the page (grey desk area) deselects the rectangle. — owner decision (coordinator brief, 2026-10-30)
- **OWN-4** Every number field scrubs by dragging its label/icon, using pointer lock so the drag never hits the screen edge. — owner decision (coordinator brief, 2026-10-30)
- **OWN-5** Every number field takes ArrowUp/ArrowDown = +/-1 and Shift+Arrow = +/-10. — owner decision (coordinator brief, 2026-10-30)
- **OWN-6** A rotated rectangle wraps text around its rotated (axis-aligned) bounding box, not its unrotated frame. — owner decision (coordinator brief, 2026-10-30)
- **OWN-7** Radius dots keep the normal arrow cursor on hover and drag radially (along the corner diagonal), not in X or Y. — owner decision (coordinator brief, 2026-10-30)
- **OWN-8** Every change (create, move, resize, rotate, radius, fill, stroke, wrap, order, delete, field edit, scrub) is one undo step and redoes. — owner decision (coordinator brief, 2026-10-30)

## Insert / create

- **CR-1** Rectangle tool (R shortcut) then click-drag on the canvas draws a rectangle. — https://help.figma.com/hc/en-us/articles/360040450133-Shape-tools
- **CR-2** Shift while drawing constrains to a square. — https://help.figma.com/hc/en-us/articles/360040450133-Shape-tools
- **CR-3** Alt while drawing draws from the centre; Shift+Alt does both. — https://help.figma.com/hc/en-us/articles/360040450133-Shape-tools
- **CR-4** Live dimensions appear under the shape while drawing (P-Doc: superseded by OWN-2). — https://help.figma.com/hc/en-us/articles/360040450133-Shape-tools
- **CR-5** A drawn rectangle has a corner handle at each corner and four inner radius handles. — https://help.figma.com/hc/en-us/articles/360040450133-Shape-tools
- **CR-6** Inserted object in Word gets a Layout Options button beside it to pick a wrap. — https://support.microsoft.com/en-us/word/training/wrap-text-around-a-picture-in-word

## Selection

- **SL-1** Click an object on the canvas selects it. — https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects
- **SL-2** Shift+click adds to / removes from the selection. — https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects
- **SL-3** Drag a marquee from empty canvas selects every object it touches. — https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects
- **SL-4** Ctrl+A selects everything. — https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects
- **SL-5** Clicking a child selects the parent group first; double-click / Enter goes one level down. — https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects
- **SL-6** Ctrl+click deep-selects through groups. — https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects
- **SL-7** Shift+Enter selects parent; Tab / Shift+Tab select next / previous sibling. — https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects
- **SL-8** Right-click > Select layer lists every object under the pointer (reach overlapped objects). — https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects
- **SL-9** Hovering an object (or its layer row) shows a highlight outline before click. — https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects
- **SL-10** Layers list: click selects, Shift-click range, Ctrl-click toggles. — https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects
- **SL-11** Behind-text objects are hard to click; Selection Pane lists objects to select them. — https://support.microsoft.com/en-us/word/layout-options
- **SL-12** Mixed selection shows shared properties and 'Mixed' for differing values. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **SL-13** Esc clears the selection and returns focus to the text (editor convention; not stated in the source page). — https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects

## Move / nudge

- **MV-1** Drag the selection to move it. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **MV-2** Arrow keys nudge by small nudge (1); Shift+Arrow by big nudge (10). — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **MV-3** Nudge amounts are configurable preferences. — https://help.figma.com/hc/en-us/articles/4404575206295-Set-small-and-big-nudge-values
- **MV-4** Snap to objects: centres and edges snap with a red guide while moving / resizing. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **MV-5** Hold Ctrl to temporarily disable snapping. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **MV-6** Snap to pixel grid keeps positions on whole units. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **MV-7** Inline objects move by being dragged to a new text position (moves like a character). — https://support.microsoft.com/en-us/word/training/wrap-text-around-a-picture-in-word
- **MV-8** Floating (non-inline) objects can be dragged anywhere on the page with text reflowing. — https://support.microsoft.com/en-us/word/training/insert-pictures
- **MV-9** Moving a floating object re-anchors it to the paragraph it is dropped near unless Lock anchor. — https://support.microsoft.com/en-us/word/layout-options

## Resize

- **RS-1** Drag side handles to change width or height only. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **RS-2** Drag a corner handle to change both. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **RS-3** Shift while resizing keeps aspect ratio temporarily. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **RS-4** Lock aspect ratio toggle; W or H edits update the other. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **RS-5** Ctrl while resizing temporarily disables a locked ratio. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **RS-6** Alt while resizing resizes from the centre. — https://help.figma.com/hc/en-us/articles/360040450133-Shape-tools
- **RS-7** Dragging a handle through zero flips the shape rather than collapsing it (editor convention; not stated in the source page). — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **RS-8** Hover over bounds shows the resize cursor matching the handle direction (rotated with the shape). — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **RS-9** Word Size tab: absolute height/width, relative % of page/margin, scale %, lock aspect ratio, reset. — https://support.microsoft.com/en-us/word/layout-options
- **RS-10** Constraints (left/right/centre/scale) govern child resize inside a frame (rectangle in page: likely out of scope). — https://help.figma.com/hc/en-us/articles/360039957734-Apply-constraints-to-define-how-layers-resize

## Rotate

- **RT-1** Hover just outside a corner shows the rotate cursor; drag rotates around the centre. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **RT-2** Shift while rotating snaps to 15 degree steps. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **RT-3** Rotation field in the panel; range -180..180, counter-clockwise positive, wraps past 180. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **RT-4** X/Y of a rotated layer refer to the original top-left of its bounds. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **RT-5** Rotation origin can be moved (Alt+R). — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **RT-6** Flip horizontal (Shift+H) / vertical (Shift+V) via shortcut and context menu. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **RT-7** Word rotation field takes whole degrees only. — https://support.microsoft.com/en-us/word/layout-options

## Corner radius

- **CRD-1** Corner radius field: type a value or scrub the icon. — https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing
- **CRD-2** Radius field takes Left/Right arrows (small nudge) and Shift for big nudge. — https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing
- **CRD-3** On-canvas radius handles appear on hover near each corner; drag adjusts all corners. — https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing
- **CRD-4** Alt+drag a radius handle adjusts one corner only. — https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing
- **CRD-5** Independent corners toggle shows four per-corner fields. — https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing
- **CRD-6** Corner smoothing slider (0-100%, iOS = 60%). — https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing
- **CRD-7** Radius is clamped to half the shorter side (editor convention; not stated in the source page). — https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing

## Number fields

- **NF-1** Position, size, rotation, radius, stroke weight fields accept typed values. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **NF-2** Fields accept maths: + - * / ^ ( ), before or after the current value. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **NF-3** Maths works on Mixed values and applies to every selected object. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **NF-4** Scrub by dragging the label/icon; Alt+hover on the input also scrubs. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **NF-5** Scrub speed changes with vertical pointer position (2x/1x/1/2/1/4). — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **NF-6** Scrubbing continues when the pointer leaves the screen (pointer lock). — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **NF-7** Enter commits; Esc reverts; blur commits; invalid input reverts. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **NF-8** Arrow nudges in fields use small/big nudge values. — https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing

## Fill

- **FL-1** Fill section: add (+), remove (-), show/hide eye per fill. — https://help.figma.com/hc/en-us/articles/360041003694-Guide-to-fills
- **FL-2** Fill swatch opens the colour picker. — https://help.figma.com/hc/en-us/articles/360041003694-Guide-to-fills
- **FL-3** Fill opacity field next to the swatch. — https://help.figma.com/hc/en-us/articles/360041003694-Guide-to-fills
- **FL-4** Multiple fills stack and reorder by drag. — https://help.figma.com/hc/en-us/articles/360041003694-Guide-to-fills
- **FL-5** Fill types: solid, gradient, pattern, image, video. — https://help.figma.com/hc/en-us/articles/360041003694-Guide-to-fills
- **FL-6** A new shape has a default solid fill. — https://help.figma.com/hc/en-us/articles/360041003694-Guide-to-fills

## Stroke

- **ST-1** Add stroke button; remove with minus; hide/show. — https://help.figma.com/hc/en-us/articles/360049283914-Apply-and-adjust-stroke-properties
- **ST-2** Stroke colour via colour picker; multiple stroke fills. — https://help.figma.com/hc/en-us/articles/360049283914-Apply-and-adjust-stroke-properties
- **ST-3** Stroke position inside / centre / outside; shapes default inside; hover previews. — https://help.figma.com/hc/en-us/articles/360049283914-Apply-and-adjust-stroke-properties
- **ST-4** Stroke weight field; weight not counted in layer dimensions. — https://help.figma.com/hc/en-us/articles/360049283914-Apply-and-adjust-stroke-properties
- **ST-5** Individual strokes per side (All/Top/Bottom/Left/Right/Custom). — https://help.figma.com/hc/en-us/articles/360049283914-Apply-and-adjust-stroke-properties
- **ST-6** Dashed stroke: dash and gap lengths. — https://help.figma.com/hc/en-us/articles/360040450133-Shape-tools

## Colour picker

- **CP-1** Saturation/brightness palette, hue slider, opacity slider. — https://help.figma.com/hc/en-us/articles/360041003774-Update-fills-using-the-color-picker
- **CP-2** Colour notation switch: HEX, RGB, CSS, HSL, HSB. — https://help.figma.com/hc/en-us/articles/360041003774-Update-fills-using-the-color-picker
- **CP-3** Eyedropper samples a colour from the canvas. — https://help.figma.com/hc/en-us/articles/360041003774-Update-fills-using-the-color-picker
- **CP-4** Document / library swatches (styles, variables). — https://help.figma.com/hc/en-us/articles/360041003774-Update-fills-using-the-color-picker
- **CP-5** Contrast check against the background (WCAG AA/AAA). — https://help.figma.com/hc/en-us/articles/360041003774-Update-fills-using-the-color-picker
- **CP-6** Blend mode per fill. — https://help.figma.com/hc/en-us/articles/360041003774-Update-fills-using-the-color-picker

## Layer order

- **LO-1** Bring forward Ctrl+], bring to front Ctrl+Shift+], send backward Ctrl+[, send to back Ctrl+Shift+[. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **LO-2** Right-click menu offers the four order commands. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **LO-3** Layers list drag reorders depth. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **LO-4** Word: Allow overlap option; Bring Forward / Send Backward set stacking of overlapping objects. — https://support.microsoft.com/en-us/word/layout-options
- **LO-5** Word: Behind text / In front of text are wrap modes that set depth relative to text. — https://support.microsoft.com/en-us/word/layout-options

## Alignment / distribution

- **AL-1** Align left/centre/right/top/middle/bottom to parent (Alt+A/H/D/W/V/S). — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **AL-2** Distribute and Tidy up for multiple objects. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions
- **AL-3** Smart selection spacing handles for equally spaced objects. — https://help.figma.com/hc/en-us/articles/360040450233-Arrange-layers-with-Smart-selection
- **AL-4** Word Position > Alignment: Left/Centre/Right relative to page/margin/column/character. — https://support.microsoft.com/en-us/word/layout-options
- **AL-5** Word vertical alignment Top/Centre/Bottom relative to page/margin/line. — https://support.microsoft.com/en-us/word/layout-options
- **AL-6** Word Position quick presets (e.g. Top Left with text wrapping). — https://support.microsoft.com/en-us/word/training/wrap-text-around-a-picture-in-word
- **AL-7** Word book layout: inside/outside of page or margin. — https://support.microsoft.com/en-us/word/layout-options

## Word position

- **WP-1** Absolute horizontal position to the right of page/margin/column/character (may be negative). — https://support.microsoft.com/en-us/word/layout-options
- **WP-2** Absolute vertical position below page/margin/paragraph/line (may be negative). — https://support.microsoft.com/en-us/word/layout-options
- **WP-3** Relative position as % of page/margin. — https://support.microsoft.com/en-us/word/layout-options
- **WP-4** Move object with text: object follows its anchor paragraph. — https://support.microsoft.com/en-us/word/layout-options
- **WP-5** Fix position on page: object stays put as text is added/removed. — https://support.microsoft.com/en-us/word/training/wrap-text-around-a-picture-in-word
- **WP-6** Lock anchor: anchor cannot move to another paragraph. — https://support.microsoft.com/en-us/word/layout-options
- **WP-7** Each floating object has an anchor paragraph (anchor icon shown when selected). — https://support.microsoft.com/en-us/word/layout-options
- **WP-8** Dialog OK applies, Cancel discards. — https://support.microsoft.com/en-us/word/layout-options

## Wrap

- **WR-1** In line with text: sits in the paragraph like a character and moves with text. — https://support.microsoft.com/en-us/word/layout-options
- **WR-2** Square: text wraps around the bounding box. — https://support.microsoft.com/en-us/word/layout-options
- **WR-3** Tight: text follows the shape outline. — https://support.microsoft.com/en-us/word/layout-options
- **WR-4** Through: like Tight with text in interior gaps via wrap points. — https://support.microsoft.com/en-us/word/layout-options
- **WR-5** Top and bottom: no text beside the object. — https://support.microsoft.com/en-us/word/layout-options
- **WR-6** Behind text: no wrap, object under text. — https://support.microsoft.com/en-us/word/layout-options
- **WR-7** In front of text: no wrap, object over text. — https://support.microsoft.com/en-us/word/layout-options
- **WR-8** Wrap side: both sides / left only / right only / largest only. — https://support.microsoft.com/en-us/word/layout-options
- **WR-9** Distance from text: top/bottom/left/right set independently. — https://support.microsoft.com/en-us/word/layout-options
- **WR-10** Edit wrap points: drag points on the wrap outline. — https://support.microsoft.com/en-us/word/training/wrap-text-around-a-picture-in-word
- **WR-11** Layout Options quick button next to the selected object. — https://support.microsoft.com/en-us/word/training/wrap-text-around-a-picture-in-word
- **WR-12** Picking a non-inline wrap makes the object draggable around the page. — https://support.microsoft.com/en-us/word/training/insert-pictures

## Context menu / clipboard / delete

- **CM-1** Right-click a shape opens its context menu (order, select layer, flip, cut/copy/paste). — https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects
- **CM-2** Duplicate with Ctrl+D. — https://help.figma.com/hc/en-us/articles/360040450233-Arrange-layers-with-Smart-selection
- **CM-3** Delete / Backspace removes the selected object. — https://help.figma.com/hc/en-us/articles/360040450233-Arrange-layers-with-Smart-selection
- **CM-4** Cut/copy/paste the object; the pasted copy is selected (editor convention; not stated in the source page). — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions

## Undo

- **UN-1** Ctrl+Z undoes the last change (incl. order changes); Ctrl+Shift+Z / Ctrl+Y redoes. — https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions

**Count:** 123 behaviours.

## Gaps

Phase 2 (2026-10-30): all 123 checklist items mapped to contract rows. 110 map cleanly (in, or out with a reason). These 13 do not, or map only by implication. The proposed row format is `ID | element | input | behaviour | scope`.

- **G-01** (checklist CR-1..3): Drawing a rectangle by click-drag with a Rectangle tool (R), Shift = square, Alt = from centre. The contract only inserts at the caret (RC-SEL-01); drawing is never stated as out. Source: https://help.figma.com/hc/en-us/articles/360040450133-Shape-tools. Proposed: `RC-OS-33 | Rectangle tool, R key, drag-to-draw (Shift square, Alt from centre) | Not built: insert is at the caret, inline (OD-INL); a drawn shape would have to be floating | out`
- **G-02** (checklist CR-6, WR-11): Word's Layout Options quick button beside the selected object (one-click wrap choice on the canvas). Source: https://support.microsoft.com/en-us/word/training/wrap-text-around-a-picture-in-word. Proposed: `RC-OS-34 | Layout Options button on the canvas | Not built: wrap is chosen in the pane (RC-BTN-05); keeps on-canvas chrome minimal (OD-LBL spirit) | out`
- **G-03** (checklist SL-4): Ctrl+A with a rectangle selected or in a document holding rectangles: what is selected (all text incl. inline rectangles? all floating shapes?). Source: https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects. Proposed: `RC-SEL-19 | Ctrl+A | rectangle selected (not editing) | Selects all document text as Word does (inline rectangles included as characters); floating rectangles are not shape-selected; inside text editing selects the rectangle's own text | in`
- **G-04** (checklist SL-7): Figma Tab / Shift+Tab = next/previous sibling, Shift+Enter = parent. RC-KB-09 repurposes Tab to cycle radius dots; the Figma meaning is not listed as out. Source: https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects. Proposed: `RC-OS-35 | Tab / Shift+Tab next/previous object, Shift+Enter select parent | Not built: Tab moves focus (dots, then pane) for keyboard access; objects are reached via Document objects (RC-KB-04) | out`
- **G-05** (checklist RS-9): Word Size tab: relative width/height (% of page/margin), Scale %, Reset to original size. RC-OS-22 covers relative position only. Source: https://support.microsoft.com/en-us/word/layout-options. Proposed: `RC-OS-36 | Relative size (% of page/margin), Scale %, Reset size | Not built: absolute W/H only in this slice; percentage sizing needs a page-setup decision | out`
- **G-06** (checklist RT-7, RT-3): Rotation sign and precision conflict: Word rotates in whole degrees (and clockwise positive in its Size tab), the contract allows 2 decimals and counter-clockwise positive (CD-01). Not listed under 'Conflicts resolved'. Source: https://support.microsoft.com/en-us/word/layout-options. Proposed: `Conflict 7: Figma rotation convention (CCW positive, 2 decimals) wins for the pane; .docx export (if any) must convert sign and round | (conflict entry)`
- **G-07** (checklist CRD-2): Figma's radius field takes Left/Right arrows for small/big nudge. RC-NF-13 defines Up/Down only; Left/Right behaviour in a focused field is unstated. Source: https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing. Proposed: `RC-NF-31 | Focused field | Left / Right | Move the text caret (no value change); Figma's Left/Right radius nudge is not adopted so all fields behave alike (OD-NUM) | in`
- **G-08** (checklist ST-3): Hovering a stroke-position option previews it on the canvas before choosing. Source: https://help.figma.com/hc/en-us/articles/360049283914-Apply-and-adjust-stroke-properties. Proposed: `RC-COL-20 | Stroke position select | hover an option | Not built: selection applies live and is one undo step | out (or in, if cheap)`
- **G-09** (checklist CP-1): Opacity slider inside the colour picker (contract has a fill-opacity field only; picker opacity slider neither in nor out). Source: https://help.figma.com/hc/en-us/articles/360041003774-Update-fills-using-the-color-picker. Proposed: `RC-COL-21 | Colour picker | opacity slider | Present and bound to the same value as Fill opacity (RC-FLD-16); one undo step per release | in`
- **G-10** (checklist AL-6): Word Position gallery presets (Top Left ... Bottom Right 'with text wrapping'). Source: https://support.microsoft.com/en-us/word/training/wrap-text-around-a-picture-in-word. Proposed: `RC-OS-37 | Position presets gallery | Not built: alignment buttons + references cover it (RC-BTN-06/07) | out`
- **G-11** (checklist WP-8): Word's Layout dialog applies on OK and discards on Cancel; the contract's pane applies live. The difference is not stated. Source: https://support.microsoft.com/en-us/word/layout-options. Proposed: `RC-OS-38 | Modal Layout dialog with OK/Cancel | Replaced by the live pane; undo replaces Cancel | out`
- **G-12** (checklist RT-6, CM-1): Figma's right-click menu carries Flip horizontal / Flip vertical; RC-CLK-05's menu lists neither. Source: https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions. Proposed: `Amend RC-CLK-05: add Flip horizontal (Shift+H), Flip vertical (Shift+V) | in`
- **G-13** (checklist UN-1): Word: F4 also redoes/repeats; Ctrl+Y repeats the last action when nothing is left to redo; undo history defaults to 100 actions. Source: https://support.microsoft.com/en-us/office/undo-redo-or-repeat-an-action-84bdb9bc-4e23-4f06-ba78-f7b893eb2d28. Proposed: `RC-UR-31 | F4 / Ctrl+Y with empty redo stack | No repeat action (does nothing); F4 not bound. RC-UR-32 | undo depth | at least 100 steps per document session | in`

### Review of contract decisions (CD-01…13) and conflicts

- CD-01: consistent with F-ARPD (CCW positive, wraps past 180). Unlisted conflict with Word's whole-degree rotation → G-06.
- CD-02: consistent with F-ARPD `Mixed+100`. OK.
- CD-03, CD-10, CD-12, CD-13: unsourced but reasonable. CD-10 Shift×10 scrub has no Figma basis (Figma uses speed zones). Accepted as a decision.
- CD-04, CD-05, CD-06, CD-07, CD-09: each has a matching out row. OK.
- CD-08: matches Figma (fill, no stroke). Word's default shape has an outline, but Word doesn't take precedence here. OK.
- CD-11: F-SEL Enter/double-click = one level down; mapping it to text editing is a fair analogue. Figma's Shift+Enter (parent) and Tab (sibling) aren't addressed → G-04.
- Conflicts 1–6: consistent with sources (6: Word Ctrl+D = Font dialog is correct). Missing conflicts: rotation convention (G-06); radius field Left/Right (G-07); Ctrl+D in place vs +10 offset (see RC-CAN-25 below); Figma shows radius handles on hover while the contract keeps them always visible when large enough (SS-RAD owner screenshot wins, so state it).

## Verified/corrected

Rows marked observed/needs verify, checked against the fetched pages. 'Corrected' means the source or claim should change.

- **RC-CLK-22** (F-KBD observed/needs verify): Verified: 'Hold down Option / Alt to create and resize shapes from their center.' Source: https://help.figma.com/hc/en-us/articles/360040450133-Shape-tools. Action: source should be F-SHAPE (Shape tools), not F-KBD.
- **RC-CLK-23** (F-ARPD; F-KBD): Verified: 'Hold down Shift and Option / Alt at the same time to do both actions.' Source: https://help.figma.com/hc/en-us/articles/360040450133-Shape-tools. Action: source F-SHAPE.
- **RC-CAN-25** (F-KBD observed/needs verify): Corrected: Ctrl+D is verified as Duplicate, but Figma's menu name is 'Duplicate Selection in Place'. The +10/+10 offset is a contract decision, not Figma. Source: https://help.figma.com/hc/en-us/articles/360040450233-Arrange-layers-with-Smart-selection. Action: re-source as F-SMS (Ctrl+D) + CD (offset).
- **RC-CAN-24** (F-KBD observed/needs verify): Partly verified: deleting layers is a documented action; the Delete/Backspace key itself isn't named on a fetched page. Keep needs-verify. Source: https://help.figma.com/hc/en-us/articles/360040450233-Arrange-layers-with-Smart-selection. Action: unchanged.
- **W-UNDO / RC-UR-*** (observed/needs verify): Verified: Ctrl+Z undoes, Ctrl+Y redoes (also F4), undo works after saving, 100-action default. Ctrl+Shift+Z isn't Word's, so it's a contract choice (fine). Source: https://support.microsoft.com/en-us/office/undo-redo-or-repeat-an-action-84bdb9bc-4e23-4f06-ba78-f7b893eb2d28. Action: mark verified; add F4 note (G-13); RC-UR-29 now sourced by W-UNDO.
- **RC-CLK-26** (F-ARPD observed/needs verify): Corrected: F-ARPD says Shift temporarily locks ratio while resizing, but not that an edge-handle Shift-drag grows the other side about its centre line. That part is a contract decision. Source: https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions. Action: source F-ARPD + CD.
- **RC-CLK-13** (F-KBD observed/needs verify): Not verifiable on help-centre pages fetched (Shapes, ARPD, Select, Keyboard). Keep as CD. Source: https://help.figma.com/hc/en-us/articles/360040328653-Use-Figma-products-with-a-keyboard. Action: re-mark CD.
- **RC-PTR-09** (F-ARPD observed/needs verify): Not stated by F-ARPD (it only says a resize cursor appears). Rotated-direction cursor is a CD. Source: https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions. Action: re-mark CD.
- **RC-COL-04** (F-PICK observed/needs verify): F-PICK says nothing about Esc/outside-click; CD. Source: https://help.figma.com/hc/en-us/articles/360041003774-Update-fills-using-the-color-picker. Action: re-mark CD.
- **RC-FLD-04** (W-LO observed/needs verify): W-LO does not say X/Y are recomputed when the reference changes; CD. Source: https://support.microsoft.com/en-us/word/layout-options. Action: re-mark CD.
- **RC-WP-13** (W-LO observed/needs verify): W-LO/W-WRAP only say non-inline objects can move with text flowing around; 'stays where it was / default references Column/Paragraph' is unstated: CD. Source: https://support.microsoft.com/en-us/word/layout-options. Action: re-mark CD.
- **RC-WP-14** (W-LO observed/needs verify): W-WRAP: inline is tied to the place where inserted and moves with text; 'start of anchor paragraph' is unstated: CD. Source: https://support.microsoft.com/en-us/word/training/wrap-text-around-a-picture-in-word. Action: re-mark CD.
- **RC-WP-19** (W-LO observed/needs verify): W-WRAP 'Fix Position on Page' only promises it stays put; the switch to a Page reference is unstated: CD. Source: https://support.microsoft.com/en-us/word/training/wrap-text-around-a-picture-in-word. Action: re-mark CD.
- **RC-SEL-17, RC-UR-28, RC-OS-31** (F-ARPD observed): None of these is stated on F-ARPD/F-SEL. Mark CD (OS-31 matches my own convention note). Source: https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions. Action: re-mark CD.
- **RC-PTR-18** (F-PANEL observed/needs verify): F-PANEL not fetched by critic; unverified. Source: https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions. Action: unchanged.

**Totals:** 13 gaps. 17 rows checked: 3 verified (RC-CLK-22, RC-CLK-23, W-UNDO/RC-UR-*) and 12 corrected. Of the corrected rows, 2 change their claim or source (RC-CAN-25, RC-CLK-26) and 10 are re-marked CD because the source does not support them (RC-CLK-13, RC-PTR-09, RC-COL-04, RC-FLD-04, RC-WP-13, RC-WP-14, RC-WP-19, RC-SEL-17, RC-UR-28, RC-OS-31). 2 remain unverified (RC-CAN-24, RC-PTR-18).

## Recheck

Recheck on 2026-10-30 at 14:52, against the contract's changelog (345 rows, 41 out of scope).

- G-01 → RC-OS-33 (out). G-02 → RC-OS-34 (out). G-03 → RC-SEL-19. G-04 → RC-OS-35 (out). G-05 → RC-OS-36 (out). G-06 → Conflict 7. G-07 → RC-NF-31 and Conflict 8. G-08 → RC-COL-20 (out). G-09 → RC-COL-21. G-10 → RC-OS-37 (out). G-11 → RC-OS-38 (out). G-12 → RC-CLK-05 amended with Flip H/V. G-13 → RC-UR-31 and RC-UR-32. **All 13 gaps resolved.**
- Corrections: RC-CAN-25 now duplicates in place, sourced to F-SMS (Conflict 9). RC-CLK-26 is now F-ARPD + CD. RC-CLK-13, RC-PTR-09, RC-COL-04, RC-FLD-04, RC-WP-13, RC-WP-14, RC-WP-19, RC-SEL-17, RC-UR-28 and RC-OS-31 are all re-marked 'CD (source does not state it)'. RC-CLK-22/23 are re-sourced to F-SHAPE, and RC-UR-29 to W-UNDO. Radius dots always shown is Conflict 10. **All 12 corrections applied.**
- Full re-pass of the 123 checklist items: every item now maps to an in-scope or out-of-scope row with a reason. **Remaining gaps: 0.**
- RC-CAN-24 (Delete key): **verified.** The Figma help centre says 'Delete marked layers by pressing the Delete or Backspace key on your keyboard' (https://help.figma.com/hc/en-us/articles/360040450233-Arrange-layers-with-Smart-selection) and, for sections, 'Select the section. Press Delete / Backspace' (https://help.figma.com/hc/en-us/articles/9771500257687-Organize-your-canvas-with-sections). Suggest the source F-SMS and dropping 'needs verify'. Note: Ctrl+Backspace is Figma's Ungroup (https://help.figma.com/hc/en-us/articles/360041539473-Frames-in-Figma-Design); groups are out of scope, so on a selected rectangle Ctrl+Backspace should act like Delete or do nothing. Optional row; not counted as a gap.
- RC-PTR-18 (pane button cursor): **not verifiable.** The Design-panel article (https://help.figma.com/hc/en-us/articles/360039832014), F-ARPD and F-SEL mention only the scrub cursor and canvas cursors; none says which cursor pane buttons show. Recommend re-marking it CD: the arrow is the desktop-app convention and it's consistent with RC-PTR-19.
