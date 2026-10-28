# Research rig

Drives Chrome with [Stagehand](https://github.com/browserbase/stagehand) (v4.3.0, MIT) to collect
evidence for the [RES](https://github.com/alextnetto/res) knowledge bases in `../re-*/`.

```powershell
cd research/rig
npm install                      # registry from .npmrc (the approved proxy)
node capture.mjs <plan.json>     # add --headed to watch
```

A plan lists items: a URL, optional `steps` (`eval`, `click`, `key`, `wait`) and what to keep. Each
item writes `<id>-<slug>.png` and, when `dataId` is set, `<dataId>-<slug>-data.json` (the output of
RES's `mask.js`, `inventory.js`, `tokens.js` and the item's own `extract`) into the knowledge
base's `evidence/`, and appends rows to `evidence/index.csv`. Plans and raw help-centre pages live
in the ignored `.cache/`.

## How it runs on this machine (W-decisions)

- **No model.** No LLM API key is configured, so Stagehand's `act`, `extract` and `observe` are not
  used; the rig uses its deterministic page API (navigate, screenshot) only.
- **Connect, not launch.** `localBrowser.launch()` timed out after 60 s with Chrome 156 (headless
  and windowed) and Edge exited at once. The rig starts Chrome itself with its own profile in
  `.cache/profile`, loads the bundled Stagehand extension over CDP, then attaches with
  `localBrowser.connect({ cdpUrl, extensionId })` and `Stagehand.create({ browser })`.
- **Page scripts over CDP.** Stagehand's `page.evaluate` is routed through its extension and took
  minutes on a large Google Doc, so RES page scripts run through a direct `Runtime.evaluate` on the
  page target.
- **No clicks inside third-party documents.** Anonymous visitors to the public Google Doc are put
  in suggesting mode, so typing or clicking in the page could write to someone else's document
  (RES A5). The rig only reads the DOM; menus are read from the DOM rather than opened, because
  synthetic menu clicks left the page unresponsive in headless Chrome.
- **Policy-blocked targets.** "Target.attachToTarget: Not allowed" errors come from extensions forced
  by device policy and are harmless.

## Needs the owner

Live observation of Word for the web and of signed-in Google Docs (version history, comments,
suggestion review) needs a test account. Sign in once in a headed run (`--headed`) with a
throwaway account; the profile in `.cache/profile` keeps the session. Never use a real account.
