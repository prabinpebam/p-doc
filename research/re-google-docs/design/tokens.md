# Design tokens

Theme(s) studied: light (the document rendered light although headless Chrome reported `prefers-color-scheme: dark`). Window: 1440x900. Values are computed styles sampled from 1111 elements. [obs EV-002]

## Color

| Token | Light | Dark | Variable | Used for | Evidence |
|---|---|---|---|---|---|
| surface-chrome | rgb(240,244,249) | not observed | none | Toolbar pill and chrome backgrounds (32 uses) | [obs EV-002] |
| surface-chrome-strong | rgb(221,227,234) | not observed | none | Pressed/selected chrome, sidebar active tab (48 uses) | [obs EV-002] |
| surface-app | rgb(248,250,253) | not observed | none | App background behind the page (11 uses) | [obs EV-002] |
| text-primary | rgb(31,31,31) | #e3e3e3 | --gm3-sys-color-on-surface | Body and title text | [obs EV-002] |
| text-secondary | rgb(68,71,70) | #c4c7c5 | --gm3-sys-color-on-surface-variant | Labels, icons (115 uses) | [obs EV-002] |
| border | rgb(116,119,117) | #8e918f | --gm3-sys-color-outline | Control borders (134 uses) | [obs EV-002] |
| accent | rgb(11,87,208) | #a8c7fa | --gm3-sys-color-primary | Primary button, links, active outline item | [obs EV-002] |
| accent-container | rgb(211,227,253) | #004a77 | --gm3-sys-color-secondary-container | Share button fill, selected rows | [obs EV-002] |
| accent-strong | rgb(8,66,160) | not observed | --gm3-sys-color-on-primary-fixed-variant | Text on accent containers | [obs EV-002] |

## Typography

| Token | Family | Size | Weight | Line height | Used for | Evidence |
|---|---|---|---|---|---|---|
| ui-small | Google Sans | 11px | 400/500 | 11px | Toolbar picker values, badges (98 uses) | [obs EV-002] |
| ui | Google Sans / Roboto | 14px | 400 | 16px | Menus, outline items | [obs EV-002] |
| ui-strong | Google Sans | 14px | 500 | 20px | Buttons (Share, Sign in) | [obs EV-002] |
| title | Google Sans | 18px | 400 | 22px | Document title | [obs EV-002] |
| document-default | Arial (docs default) | 11pt | 400 | 1.15 | Normal text in a new document | [doc SRC-010] [inf Q-002] |

## Spacing, radius, shadow

| Token | Value | Variable | Used for | Evidence |
|---|---|---|---|---|
| space-1 | 2px | none | Icon button padding | [obs EV-002] |
| space-2 | 4px | none | Gaps inside groups | [obs EV-002] |
| space-3 | 8px | --gm3-menu-container-shape | Menu padding | [obs EV-002] |
| radius-sm | 4px | none | Controls, menus (39 uses) | [obs EV-002] |
| radius-pill | 9999px | --gm3-toolbar-floating-container-shape | Toolbar container, sidebar rows | [obs EV-002] |
| shadow-menu | rgba(0,0,0,.3) 0 4px 16px | none | Menus and popovers | [obs EV-002] |

## Motion

| Token | Duration | Easing | Used for | Evidence |
|---|---|---|---|---|
| fast | 100-125ms | linear/ease | Hover and state changes | [obs EV-002] |
| panel | 218ms | ease | Sidebar width | [obs EV-002] |
| emphasised | 600ms | cubic-bezier(0.05,0.7,0.1,1) | Panel slide-in | [obs EV-002] |

## Z-index layers

| Layer | Value | Used for | Evidence |
|---|---|---|---|
| chrome | 98-100 | Toolbar and title bar | [obs EV-002] |
| popover | 598-1004 | Menus and dialogs | [obs EV-002] |

## Icons

| Name | Size | Where used | Evidence |
|---|---|---|---|
| Material Symbols | 20-24px | Toolbar, sidebar | [obs EV-001] |

## Breakpoints and layout

| Width | Change | Evidence |
|---|---|---|
| 1440 | Full toolbar shown in one row; sidebar 300px (--companion-shell-width) | [obs EV-001] [obs EV-002] |
| Narrow | Toolbar overflows into a "more" button | [inf Q-005] |
