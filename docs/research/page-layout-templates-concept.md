<!-- Provenance: copied verbatim below this note on 2026-10-30 from the coordinator session file
page-layout-templates-concept.md (sha256 C19CF20FB1243086D08D96A7FA00D000ADB2F07851EC7CC9DC3869BDF0493525),
delivered for the owner request recorded in page-layout-templates-0242.json
(sha256 4F73B3F34AA2EBD1C37AA2B4255182E2A494910360916043BF454FD39448EB31; owner message 2026-10-30 02:42 +05:30).
Session: ab8c7a88-879b-4564-b4af-12a1be70b496. Links in the body are the author's absolute local targets and are kept unchanged. -->

> **Repository note (2026-10-30):** this is a **concept awaiting the owner's review**, not an approved
> requirement. Its PL-* identifiers are proposal-local; the spec reserves **U125** as the umbrella
> for page-layout templates and links here ([spec §12.12](../product/spec.md#1212-page-layout-templates-u125-concept)).
> Owner request trail: [owner request ledger](../work/work-plan.md#7-owner-request-ledger).

# Page layouts for a flowing document

**Status: PROPOSED / DOCUMENTED — not implemented or owner-approved.**  
Prepared 30 October 2026. Standalone concept for coordinator integration; no canonical requirements, source or review build changed.

## TL;DR

Choose professional pages without becoming a designer. Extend **Template**: themes supply tokens, colours and text styles; layouts supply geometry, constraints and semantic roles. Theme recommendations rank layouts, not lock them together.

Every rendered page has a usable primary text region, including an empty page or cover. One logical main story flows through those regions. Layout assignments follow content boundaries, not page numbers. Repeated decoration belongs to the layout; a writer’s notes, pull quotes and text boxes belong to content.

Preview real content before applying. Never delete content, silently substitute designs or conceal overflow. Prove existing-flow reuse before advanced anchoring and export.

## Grounding and source boundary

Read-only baseline: `36a7205326fd88babc27b38968adb40714ce6e6c` in `p-doc-template`. Working-tree colour documentation supplied context, not new validation evidence.

Existing [spec][spec] promises **P1** preservation, **P2** offline ownership, **P3** calm structure and **P4** print fidelity ground this proposal. Its **J3/J15/J19**, **U55–U57** (sections, columns, headers), **U81/U82** (chrome), **U100–U102** (embedded design), and current **U103–U109** Template/inspector amendments are the integration points. The spec repeats U103 in an older reuse section: reconcile that during integration rather than invent canonical IDs here.

The [existing DoD][done] records prior Template preview/isolation, not these proposals. Extend [Template JSON][json], [chrome contexts][chrome], [colour controls][colour] and [copy vocabulary][copy].

**Links** use absolute local targets so they work from this standalone artifact. On canonical placement at `docs/design/page-layout-templates-concept.md`, the integrator should convert them back to relative links.

## 1. Relationship model

```text
Template package
  ├─ Theme: tokens + semantic colours + text-style bindings
  ├─ Layout definitions: geometry + roles + variants + constraints
  └─ Theme's preferred layout ranking
           ↓ independent embedded copies
Document content + section-boundary assignments + object anchors
           ↓ resolve roles → validate fit → paginate
Primary story across pages + repeated chrome + secondary stories
           ↓ shared resolved geometry
Pages / print / PDF                 DOCX: explicit fidelity assessment
```

| Entity | Owns; does not own |
|---|---|
| Template package | Reusable, content-free formatting bundle; extends existing presets and portable JSON. Never document text, comments, notes, credentials or repository settings. |
| Theme | A conceptual composition of existing font, Color and Spacing presets, semantic colour roles and text styles; not another global theme store or app-chrome setting. |
| Layout | Named geometry, supported paper profiles, primary region, optional slots, decoration, role requirements and variants. No embedded document content or theme-specific colour literals. |
| Assignment | A layout revision and variant policy attached to a stable section/content boundary; document-specific mappings and overrides. |
| Content | Main story, secondary stories, anchors, comments and editable slot values. Layout removal cannot remove these. |

### PL-D1 — Identity and portability

Each layout has stable identity, immutable revision and separate schema version. Duplication creates a new identity; editing creates a draft/new revision. Documents embed local copies and role mappings. Library updates never mutate documents; adopting a revision requires preview and supports Undo.

Extend [the existing strict version-1 schema][templates-source] with an explicit new version, never hidden extra fields. Read old templates unchanged; derive initial assignments from existing page setup without changing appearance. Preserve import size/security checks, atomic writes and source isolation; specify changed limits before implementation.

Portable Template JSON includes layout definitions and theme mappings, never populated slots or anchors. Native document save includes all assignments, content and unresolved placement records. No remote resource resolution, automatic downloads or remote mutation.

### PL-D2 — Independence with checks, not universal compatibility

Geometry may use dimension tokens. Body, accent and note roles describe purpose, not palettes. Before Apply, check schema/features, roles, aliases, fonts, paper/orientation, text-area constraints and colour contrast.

Missing roles require explicit mapping or creation in the staged theme, with previews. Never silently map to black, flatten aliases or substitute layouts. “All compatible” excludes unresolved candidates but exposes reasons and mapping. Technical compatibility does not certify aesthetics.

## 2. Flow, boundaries and variants

### PL-D3 — A primary story, not independent page canvases

One logical document story traverses ordered primary regions and explicit breaks. Regions are rectangular: one column or declared linked columns. Reuse [sections/columns][sections-source] and [pagination][pagination-source]; defer arbitrary shapes and free frame threading.

An empty region is valid and focusable; no placeholder content is forced. Parity-inserted blank pages also retain a valid primary region. Editing one offers to materialise it as an explicit content section, rather than silently attaching text to a disposable spacer. Text boxes are separate secondary stories, never substitutes for the mandatory region.

### PL-D4 — Content-stable scope

“Page 3” is a pagination result, not a durable address. Insertions/deletions move pages, not content boundaries. Add stable identity alongside existing section-break semantics; never use page indices as storage keys.

| Scope offered | Exact reversible rule |
|---|---|
| Whole document | Assign across all sections; preserve their breaks, paper, numbering and header/footer content. Report any incompatible section before committing anything. |
| Current section — default | Replace that section’s assignment; show its opening words and current page span. |
| From here | Explicitly label “From this paragraph to document end”. Start before the containing top-level block; insert/reuse a next-page section boundary and change following assignments without deleting existing boundaries. |
| Selected range | Expand to whole top-level blocks and show the expansion. Insert/reuse boundaries at both ends; preserve original assignments after the range and existing internal section settings. Tables are indivisible scope blocks initially. |

These are full-system routes; the thin prototype deliberately offers only whole document/current section. New physical geometry at a continuous break requires explicit conversion to next-page, previewed before Apply; it cannot change halfway down a sheet initially.

A “this page” entry instead offers **Current section** or **Start here**, naming the first affected paragraph. It never promises that an ordinal will stay fixed. A one-page result requires a content range bounded by explicit breaks; that range may become several pages after editing. Boundary deletion explains which assignment will survive and offers cancellation; Undo restores boundaries, assignments and content together.

### PL-D5 — Variants and covers

Variants are first-page and continuation, optionally recto/verso-specialised. First-page takes precedence, then its declared parity specialisation; other pages use continuation/parity rules. No hidden first-page fallback.

Parity is physical sheet order, adjusted for binding direction, not displayed page numbering. Restarting at “1” or using Roman numerals cannot flip inside/outside margins. Explicit odd/even starts use the existing section mechanism and preview inserted blanks.

A cover is a first-page layout whose primary story can hold title, author and summary, followed by a deliberate next-page body section. It may be empty. Default insertion creates an empty leading cover section and preserves the entire existing body after its boundary. Alternatively, explicitly selected opening blocks become cover content, with the remaining body boundary previewed. Never infer that the first body paragraph is disposable title text.

If cover content exceeds one page, show the declared cover-continuation treatment or ask for an explicit layout adjustment; never swallow body text or clip the title. This reconciles mandatory flow with the existing cover request; it is not a veto on independent cover work.

## 3. Objects, paper and preservation

### PL-D6 — Ownership before positioning

Layout-owned rules, accent bands and margin marks repeat and are locked during document editing. Running headers, footers and page-number fields reuse the existing mechanism and its section linkage; layouts position/reserve them, not invent competing text stores. Existing custom header/footer content is never overwritten by a suggested layout value.

Content-owned text boxes, images, pull quotes and sidenotes anchor to stable text/block identities. Slot geometry is absolute within a logical page region, but association follows the anchor’s new page after reflow. An editable slot is a placement opportunity, not ownership of its contents.

Repeated pull quotes reference an extract of the main story and are omitted from duplicate assistive reading; editing the source updates the extract. A unique note is read once after its anchor, with a return route. Decorative marks are excluded. Explicit reading order is independent of visual coordinates. Deleting an anchor keeps its note in an identified “Needs placement” state until reanchored or explicitly deleted; Undo restores the relationship.

Priority: reserve primary text and header/footer space; place anchored objects in declared slots; resolve conflicts in anchor order; place decoration behind content. Initially, slots do not overlap the primary region and wrap is none. Later rectangular exclusions must go through the shared insertion-object/wrap foundation, not a layout-specific engine. No automatic font shrinking or arbitrary front-layer text obstruction.

When slots disappear, a secondary story overflows, an object exceeds available paper, or constraints are impossible, retain all data and show the affected objects. Before replacement, block Apply until the person maps a slot, adjusts geometry, explicitly moves content inline, or accepts a saved **Needs placement** state. That state is not success: the content remains accessible in logical order and print/PDF is blocked until resolved. Never silently crop, discard, move to an unrelated page or export incomplete content.

Assignment/object overrides attach to those identities, not a physical page. Reset removes the chosen override, never its content. Unmatched overrides remain recoverable with an explanation. Layout definition editing is a separate mode; ordinary dragging cannot accidentally alter every repeated element.

### PL-D7 — Responsive to paper

Support declared A4/Letter and orientation profiles using inside/outside margins, binding edges, gutters and bounded dimensions. Recompute constraints for paper changes; this is not website responsiveness. Enforce a positive usable text area and catalogue-specific minimum column width/height measured against the resolved typography. Numerical minima require typography trials, not invented universal constants.

Font/theme changes can alter line breaks and pagination. Preview the actual metrics, unavailable fonts, contrast and object fit. Preserve layout identity and overrides where compatible; unresolved changes leave the previous applied state intact. App light/dark/contrast changes do not silently change printed paper colours.

### PL-D8 — Honest output and storage

Pages, print and PDF must consume the same resolved geometry and font metrics. Existing pagination is a foundation, not proof for these new layouts. DOCX sections, columns and positioned-object mappings need a capability matrix and round-trip experiments; full fidelity is not promised. Export identifies unsupported effects and offers PDF, cancellation or an explicitly acknowledged simplified DOCX copy. The native document remains unchanged.

Preview is local and non-mutating. Apply is one undoable transaction, including boundaries/mappings, followed by the existing disk-save pipeline. “Saved” means written to disk. A failed save retains the editable state and retry route; no publishing, Git changes or account access is implied.

## 4. Promise → jobs → user capabilities

| Local promise | What would break it |
|---|---|
| PL-P1 — Professional pages without designing each page | Repeated manual repair after ordinary writing |
| PL-P2 — Your words survive every design change | Missing text, notes, overrides or undo history |
| PL-P3 — Predictable local output | Hidden substitutions, network dependence or misleading print fidelity |

| Job | When I… want to… so I can… | Promise |
|---|---|---|
| PL-J1 | prepare a report, choose a coherent composition, deliver credible pages | PL-P1 |
| PL-J2 | revise a long document, keep design associated with its content, continue writing | PL-P1/PL-P2 |
| PL-J3 | open a publication, distinguish cover/chapter starts, orient readers | PL-P1 |
| PL-J4 | reuse branding, change appearance independently, avoid redesign | PL-P1/PL-P2 |
| PL-J5 | exchange or recover work, retain content and predictable output, trust the file | PL-P2/PL-P3 |

**A person can…**

| ID | Focused capability | Job | Flow → view |
|---|---|---|---|
| PL-U1 | compare compositions using their own writing | PL-J1 | PL-F1 → PL-V1/PL-V2 |
| PL-U2 | identify everything affected before changing its design | PL-J1 | PL-F1 → PL-V2 |
| PL-U3 | abandon a proposed change without changing the document | PL-J5 | PL-F1 → PL-V2 |
| PL-U4 | restore the preceding design and its boundaries | PL-J5 | PL-F1 → PL-V1 |
| PL-U5 | start a new composition at a chosen paragraph | PL-J2 | PL-F2 → PL-V2 |
| PL-U6 | change a bounded passage while retaining surrounding designs | PL-J2 | PL-F2 → PL-V2 |
| PL-U7 | distinguish opening pages and facing sides without changing numbering | PL-J3 | PL-F3 → PL-V2 |
| PL-U8 | add an empty or populated cover without replacing the body | PL-J3 | PL-F3 → PL-V2 |
| PL-U9 | change fonts and colours while retaining compatible composition | PL-J4 | PL-F4 → PL-V2/PL-V3 |
| PL-U10 | keep a note associated with its passage through revisions | PL-J2 | PL-F5 → PL-V4 |
| PL-U11 | replace a composition without losing its secondary text | PL-J2 | PL-F5 → PL-V3/PL-V4 |
| PL-U12 | restore default positioning without deleting an object | PL-J2 | PL-F5 → PL-V4 |
| PL-U13 | create a reusable composition independently of its source | PL-J4 | PL-F6 → PL-V5 |
| PL-U14 | transfer reusable formatting without transferring private writing | PL-J5 | PL-F6 → PL-V5 |
| PL-U15 | reopen the document with assignments, notes and unresolved work intact | PL-J5 | PL-F7 → PL-V1/PL-V3 |
| PL-U16 | produce faithful output or identify limitations before exporting | PL-J5 | PL-F7 → PL-V3 |

## 5. Task flows

**Shared transaction contract:** entering, browsing or cancelling never mutates document/history. Empty documents preview an empty usable primary region, with an explicitly labelled sample option. Empty galleries explain filters and offer compatible defaults. Invalid drafts remain editable. Preview/application errors keep the previous applied document and offer correction or cancellation.

**PL-F1 — Choose, preview, apply, cancel, undo.** Enter Template’s Layouts area from either chrome. Choose scope (current section by default), then a recommended or compatible family. Preview affected real pages, boundaries, page-count changes and retained overrides in the existing multipage renderer. Resolve checks in PL-V3 or cancel. Apply stages no unrelated theme changes. Return to the same content anchor; disk status follows. Undo restores the entire prior transaction, including inserted boundaries.

**PL-F2 — From here / range.** Enter with a caret or selection. Choose the explicit scope; review whole-block expansion, start/end boundaries and what resumes afterwards. Missing selection disables range with an explanation. Existing continuous geometry conflicts require an explicit next-page choice. Preview the changed span and neighbouring pages; resolve, apply or cancel. Later insertion/deletion follows boundaries rather than the old page span.

**PL-F3 — Variants / cover.** Enter the assignment’s variant settings or the existing cover entry. Choose first/continuation and optional facing-side variants. For covers, choose empty leading section or selected opening content; preview the body boundary and parity blanks. Missing variants or cover overflow enter PL-V3. Apply creates one reversible change; cancel preserves original text, breaks, numbering and headers.

**PL-F4 — Theme swap.** Enter existing font/Color/Spacing/template comparison routes. Keep current layout assignments by default; adopting a package’s preferred layouts requires a separate explicit choice. Preview actual font reflow and all required roles. Map missing roles or resolve font/fit/contrast issues; otherwise cancel. Apply theme and confirmed mappings together, retaining object identity, direct formatting and unrelated definitions.

**PL-F5 — Slot content and replacement.** Enter via anchored-object insertion/selection, not the layout editor. Choose an eligible slot; empty slots are non-printing affordances, never saved filler. Edit content, then revise preceding paragraphs: the anchor determines the destination. For a replacement layout, match compatible role/slot identities and preview each changed placement. Missing slots/overflow use PL-V3’s explicit recovery choices. Reset only selected positioning; cancel an uncommitted placement without deleting its existing story.

**PL-F6 — Duplicate, edit, save, transfer.** Enter Template advanced settings; duplicate a layout into explicit layout-edit mode. Change constraints, semantic bindings and variants against specimen content, never the live document story. Validate every declared profile; failed checks preserve the draft. Save as new locally without modifying the source. Export content-free Template JSON; cancel file selection changes nothing. Import validates fully before library mutation, gives a new local identity and reports unsupported versions. Applying the new layout still uses PL-F1.

**PL-F7 — Save, reopen, export.** Leave Template and await the normal disk-save acknowledgement; on failure keep work and retry. Reopen offline: restore exact embedded revisions, anchors, overrides and unresolved records without library/network lookup. Enter existing export/print; validate placements and output capabilities. Errors focus the affected item; offer correction, PDF or acknowledged DOCX simplification where valid, never a false successful export. Cancellation leaves the native file intact.

## 6. Views and interaction contract

| ID | Existing surface extended |
|---|---|
| PL-V1 | Template root/Layouts gallery: Current theme, Recommended and All compatible filters; job-led names, paper support and current assignment badges |
| PL-V2 | Existing multipage preview plus scope summary, real-content/sample distinction, first/continuation/recto/verso controls and affected boundaries |
| PL-V3 | Contextual compatibility/placement review beside preview; named errors, affected content, explicit repairs and export limitations |
| PL-V4 | Existing document object inspector: content, anchor, slot and local overrides; not layout-definition settings |
| PL-V5 | Advanced layout-edit mode within Template; persistent mode label, specimen preview, duplicate/save/export/import and explicit exit |

Classic exposes a discoverable **Choose layout** route beside page setup and in searchable menus. Modern’s document-root Page group links to the same Template area; selecting text or an object keeps its own inspector. A persistent Template route remains reachable without deselecting content. Both use the same commands, draft and capabilities.

Require keyboard entry, gallery arrows, labels, visible focus, Escape cancellation and focus return. Reading order follows anchors, not coordinates. Reuse token/component tiers and colour controls across light/dark/contrast and reduced motion. Cover rest, hover, pressed, selected, focus, disabled, empty, error and updating states. Narrow views stack gallery/preview, retaining scope/actions without raw UI values.

Wait contract: acknowledge immediately; responsive save/preview shows delayed inline status, waiting work retains the previous preview with “Updating preview…”, and long work exposes cancellable progress. Never blank the document or block typing. If content changes during preview, mark it stale and recompute before Apply; announce completion, not every pagination tick.

## 7. Original print catalogue

These are original directions, not copied proprietary templates or certified arbitrary combinations.

| Family | Job | Geometry, slots and variants |
|---|---|---|
| Standard | Everyday readable documents | Single column, balanced margins; first/continuation |
| Report | Navigable long deliverables | Binding gutter, existing running fields, chapter accent; first/facing sides |
| Asymmetric margin | Commentary beside an argument | Wide outside margin, note slots, narrow inside margin; mirrored variants |
| Editorial | Dense short articles | Two linked columns, opening headline space, external quote slot; first/continuation |
| Accent band | Strong identity without decoration work | Reserved side band, single column, margin marks; mirrored continuation |
| Letter | Formal correspondence | Primary address/salutation/body flow, optional logo slot; restrained continuation |
| Manuscript | Reviewable long prose | Spacious single column, generous annotation margins; minimal repeating chrome |
| Cover | Introduce a publication | Primary title/author/summary region, optional art slot, explicit body boundary |
| Briefing | Decisions and supporting evidence | Wide primary column, secondary key-fact slots, clear opening hierarchy |

Start with Standard and Report. Catalogue sketches and typography research can proceed independently; advanced families ship only after their constraints and object dependencies pass.

## 8. Ranked assumptions and decisions changed by evidence

Ranked highest-risk first; all **open**.

| ID | Risk; impact/evidence | Cheapest falsifiable proof | Decision changed |
|---|---|---|---|
| PL-A1 | Pagination/exclusion stability; high, partial existing-flow evidence | Fixture matrix: insert/delete paragraphs across boundaries; identical input gives identical geometry, no missing/duplicate text, no nontermination | Keep rectangular path; defer exclusions if unstable |
| PL-A2 | Content/override preservation; high, new transitions unproven | Apply/cancel/undo/remove-layout/save-reopen fixtures retain every story/object ID and value | Block release or revise transaction/storage model |
| PL-A3 | Anchored secondary stories; high, unproven | Move a note’s anchor across pages and delete it; zero orphan loss, deterministic review state and reading order | Reuse foundation if sound; defer slot families otherwise |
| PL-A4 | Theme/font/paper compatibility; high, unproven | A4/Letter × orientations × two contrasting font sets: every violation detected before commit/output | Narrow supported profiles or revise constraints |
| PL-A5 | Print/PDF/DOCX fidelity; high, partial baseline only | Compare geometry/page breaks and extracted text on a small golden set; record every DOCX difference | Gate PDF/print shipping; limit DOCX features explicitly |
| PL-A6 | Non-designers understand scope; medium, no user evidence | Five first-time writers: at least four choose correctly and predict reflow without help | Rename scopes/reduce initial choices |
| PL-A7 | Catalogue maintainability/licensing; medium, unproven | Author two original families using one schema; all roles/profile checks pass without engine exceptions or restricted assets | Reduce catalogue scope before adding custom cases |

PL-D1–PL-D8 are working defaults; uncertainty requires validation, not owner questions.

## 9. Stages and Definitions of Done

**Now:** concept review. **After review:** thin Standard/Report prototype using existing Template/sections/preview; whole/current-section scope, empty primary regions, Apply/Undo. **Then:** necessary anchor/column/wrap experiments through the shared insertion-object foundation. **Later:** range scopes, catalogue and authoring. Catalogue/research can proceed independently; shipping dependent families awaits their gates.

| ID | Done when; trace | Required evidence |
|---|---|---|
| PL-DoD1 | Document defines ownership, defaults and all PL-U routes | Internal ID/flow/view/link audit; concept status explicit |
| PL-DoD2 | Document separates source facts, proposals and feasibility gates | Verified source/reference ledger; coordinator/owner review remains separate |
| PL-DoD3 | Choose/preview/cancel/apply/undo preserves content; PL-U1–PL-U4 | Native-state comparison before/after; cancel creates no undo entry; one undo restores application |
| PL-DoD4 | Paragraph insertion/deletion preserves scoped assignments; PL-U5–PL-U8 | Worked report: change a passage, insert preceding paragraphs, remove them, undo; boundaries and body/cover contents exact |
| PL-DoD5 | Theme changes preserve layouts or expose incompatibility; PL-U9 | Font/colour swap, missing-role map, cancel and undo; same object IDs and unchanged direct formatting |
| PL-DoD6 | Notes survive reflow, missing slots and reset; PL-U10–PL-U12 | Move anchor across pages; replace with slotless layout; recover note, reset position, undo; no lost or doubled reading |
| PL-DoD7 | Reuse/transfer cannot leak writing or mutate originals; PL-U13/PL-U14 | Duplicate/edit/save/export/import/relaunch; inspect JSON for zero content and stable independent definitions |
| PL-DoD8 | Offline reopen preserves resolved and unresolved work; PL-U15 | Disk reopen with source template unavailable; compare stories, mappings, overrides and pending placements |
| PL-DoD9 | Output matches approved geometry or honestly refuses; PL-U16 | Print/PDF comparison and DOCX capability report; oversized-object export rejected until resolved |
| PL-DoD10 | Every route is operable across chrome/accessibility contexts; PL-U1–PL-U16 | Keyboard/screen-reader review, light/dark/contrast and narrow/wide inspection; wait/cancel/stale-preview cases |

PL-DoD1/PL-DoD2 assess documentation; PL-DoD3–PL-DoD10 are unproven implementation gates.

**Try it later:** with a cover, two sections and anchored note, preview asymmetric margins; cancel, apply, insert preceding paragraphs, swap fonts, replace with a slotless family, recover the note, undo, reopen offline and export. Scope stays clear; writing survives.

**Self-critique/fixes:** avoid duplicate theme stores through composition; replace false page permanence with content scope; prevent invisible preservation through logical access and output gates; defer broad authoring until selection is useful. Documentation cannot prove pagination feasibility.

## 10. Reference ledger

Official references retrieved **30 October 2026**: analogies, not live-product or P-Doc parity evidence.

| Verified source | Evidence and deliberate difference |
|---|---|
| [PowerPoint slide layouts](https://support.microsoft.com/en-us/powerpoint/what-is-a-slide-layout) | Positioned placeholders and reusable layouts; P-Doc adds continuous primary flow |
| [PowerPoint slide masters](https://support.microsoft.com/en-us/powerpoint/training/what-is-a-slide-master-in-powerpoint) | Separate master/layout editing from ordinary content editing; P-Doc proposes cross-theme layout reuse |
| [Word section breaks](https://support.microsoft.com/en-us/word/use-section-breaks-to-change-the-layout-or-formatting-in-one-section-of-your-word-document) | Next/continuous/odd/even boundaries and sectional formatting; supports content-boundary analogy |
| [Word first-page headers](https://support.microsoft.com/en-us/word/change-or-delete-a-header-or-footer-on-a-single-page) | Different First Page and section linkage; P-Doc retains content instead of adopting destructive changes |
| [Word odd/even headers](https://support.microsoft.com/en-us/word/create-different-headers-or-footers-for-odd-and-even-pages) | Distinct repeating furniture; not evidence for P-Doc’s physical-parity policy |
| [InDesign parent pages](https://helpx.adobe.com/indesign/desktop/create-and-organize-pages/create-and-manage-parent-pages/about-parent-pages.html) | Repeated locked elements, overrides and layers; P-Doc makes preservation explicit |
| [InDesign text threading](https://helpx.adobe.com/indesign/desktop/add-and-manage-text/add-and-import-text/thread-text-frames.html) | One story across connected frames and explicit overset; P-Doc initially restricts geometry |

Word cover-documentation attempts returned 404. Adobe’s primary-frame tutorial returned a client-rendered shell; primary-frame/Smart Text Reflow help routes were inaccessible. Detailed behaviour is **unverified**. These remain research leads, not requirements evidence. Cover/automatic-flow policies above are P-Doc decisions, not Word/InDesign parity claims.

[spec]: E:/Projects/side-projects/p-suite/p-doc-template/docs/product/spec.md
[done]: E:/Projects/side-projects/p-suite/p-doc-template/docs/product/definition-of-done.md
[json]: E:/Projects/side-projects/p-suite/p-doc-template/docs/design/template-json.md
[chrome]: E:/Projects/side-projects/p-suite/p-doc-template/docs/design/chrome-modes.md
[colour]: E:/Projects/side-projects/p-suite/p-doc-template/docs/design/shared-colour-system.md
[copy]: E:/Projects/side-projects/p-suite/p-doc-template/docs/design/copy-glossary.md
[templates-source]: E:/Projects/side-projects/p-suite/p-doc-template/packages/core/src/templates.ts
[sections-source]: E:/Projects/side-projects/p-suite/p-doc-template/packages/core/src/sections.ts
[pagination-source]: E:/Projects/side-projects/p-suite/p-doc-template/packages/core/src/paginate.ts
