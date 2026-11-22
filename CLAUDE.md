# Arkhive — project memory

Tauri v2 macOS file manager in plain JS (no framework). The folder is still named `Samsim`; the app is Arkhive (bundle id `dev.archiveos.app`). The parent `../CLAUDE.md` is the constitution: spec-first, test-first, feature branches.

## Where things are
- `app/index.html`: all UI, CSS and the shelf/sheet engine. `app/core.js`: pure logic. `app/landing.js`: the pixel desk on the home screen.
- `src-tauri/src/lib.rs`: commands, including the viewer (`preview_doc`, `read_text`, `check_pdf`). `src-tauri/src/index.rs`: own SQLite FTS5 index.
- Current spec: `specs/005-arkhive-index/` (US1–US11, tasks T101–T126).
- Tests: `npm test` (logic), `npx playwright test` (UI, stand-in backend), `cd src-tauri && cargo test`.

## Workflow (owner's choices)
- GitHub: https://github.com/asimkm1314/Arkhive is `origin`. The old `samsim` remote is retired; never push there.
- Each change gets its own branch (`NNN-name`) and reaches `main` by a pull request that is merged, so `main` always shows everything.
- After UI changes: `npm run tauri build`, then replace `/Applications/Arkhive.app` (Launchpad and the Desktop alias point there).
- If the .dmg step fails, detach the stale `rw.*.Arkhive*.dmg` image (`hdiutil info`) and rebuild with `--bundles dmg`.
- The machine is often heavily loaded. If a full UI run fails on timeouts, re-run `--last-failed --workers=1` before treating it as a real failure.

## Decisions to keep
- Beige light home is the default. Dark mode is opt-in (top-bar button, remembered in `localStorage` key `arkhive-theme`).
- Labels have no brackets; back reads ← HOME. Files open inside Arkhive, not Finder.
- Motion: sheets open in 450 ms and close in 300 ms on `cubic-bezier(.32, .72, 0, 1)`. Captions roll in 180 ms. The ENTER ARKHIVE hover lifts −4px at 1.02, gated to a fine pointer. The theme reveal takes 700 ms.
- Corners: `.box` 8px, bars 12px, search 12px, tray top 14px. No `overflow: hidden` on `.box`, because it would clip touch targets.
- Ad-hoc signing only (no Developer ID yet), so other Macs need Privacy & Security → Open Anyway.

## Open
- T120 Developer ID signing and notarization (owner, later).
- T906 Android: kept as a backup, do not build; remind the owner each session.
- T933 white band on the iPhone simulator. The top-right group, including the theme button, is hidden on phones.
