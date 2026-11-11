# Quickstart: ArchiveOS

## Prerequisites

- Node 22+, Rust stable (`rustup`), Xcode (for macOS/iOS builds), Google Chrome (for UI tests)
- `npm install`

## Automated checks

```sh
npm test                         # node --test: query, ranking, sort, filter, shelf math
npm run test:ui                  # Playwright on app/index.html with demo data
cd src-tauri && cargo test       # query building, validation, snippet parsing
```

All three must pass.

## Browser preview (demo data)

Open `app/index.html` directly in a browser.

1. Press Enter → the sheet grows out of the binder and the category shelf rises.
2. Press `/`, type `blood related`, press Enter → results include `CBC_Blood_Panel_Report_Nov2026.pdf`, `Scan_Nov_10.pdf`, `IMG_4092.JPG`, each showing a match snippet.
3. Choose `NAME (A–Z)` → order is alphabetical; choose `PDF` → only PDFs.
4. Click the active cover → the inspector bleeds in; `blood` is highlighted. `OPEN` says it needs the desktop app. Escape closes.

## Desktop app (real files) — manual, needs live Spotlight/Finder (T900)

```sh
npm run tauri dev
```

1. Search a word you know appears inside one of your PDFs but not in its name → it appears with a snippet.
2. Inspector → `OPEN IN DEFAULT APP`, `QUICK LOOK`, `REVEAL IN FINDER` each act on the real file.
3. Search a word that exists nowhere → explicit "no files match" state.
