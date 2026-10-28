# C-002 Menu bar
Product name: `#docs-menubar` · Used in: S-001 · Status: draft

## Anatomy

Text menus under the title; items open dropdown menus with accelerators on the right and submenu arrows. 225 menu items, 122 checkbox items, 33 radio items, 29 menus present in the DOM. [obs EV-002] [obs EV-003]

## States

| State | Visual change | Evidence |
|---|---|---|
| Default | Plain 14px labels, no borders | [obs EV-001] |

## Measurements and tokens

Labels 14px; menus use role=menu with menuitem, menuitemcheckbox, menuitemradio. [obs EV-002]

## Not tested

- Hover, focus and pressed states: no pointer interaction with the third-party document (charter: no clicks inside the page).
