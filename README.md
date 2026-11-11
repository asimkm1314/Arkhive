# ArchiveOS

A tactile 3D file shelf for macOS (and iOS, limited to the app's Documents folder). Type a phrase like "blood related" and get back the lab report PDF named `Scan_Nov_10.pdf`, because the search looks inside files, not only at their names.

- **Landing**: a pixel meadow with a laptop and an archive binder. Press Enter or click the binder.
- **Tier 1**: a shelf of 12 vaults (PDF, PPT, JPEG, DOCX, XLSX, CODE, MEDIA, ZIP, Medical, Finance/Legal, Projects, Recent).
- **Tier 2**: a shelf of the actual files in a vault or a search, sortable by relevance, name, date or size, and filterable by format.
- **Inspector**: file details, the matched text highlighted, and Open / Quick Look / Reveal in Finder.

Keys: `←` `→` browse, `Enter` open, `/` or `⌘K` search, `Esc` back, `Space` Quick Look.

## Run it

| What | How |
|---|---|
| Browser preview (demo data, no install) | open `app/index.html` |
| Desktop app on your real files | `npm install`, then `npm run tauri dev` |
| macOS app bundle | `npm run tauri build -- --bundles app` |
| iOS simulator build | `npm run tauri ios build -- --debug --target aarch64-sim` (needs Xcode + CocoaPods) |

## Tests

```sh
npm test                                   # logic: query cleaning, synonyms, ranking, sort, filter, shelf math
npm run test:ui                            # Playwright on the demo page (uses your installed Chrome)
cd src-tauri && cargo test                 # backend: validation, Spotlight query building, snippet parsing
cd src-tauri && cargo test -- --ignored    # live check against real Spotlight (writes, then deletes, one file in ~)
```

## How search works

- **macOS**: Spotlight (`mdfind`) already indexes the text inside PDFs, Office files and code, and the text in images on Apple Silicon. ArchiveOS runs one Spotlight query per search word, ranks files by how many words hit (name hits count triple), and pulls match snippets from Spotlight's own extracted text. There's no separate database to build or keep in sync.
- **"Semantic" search** is a small related-words table in `app/core.js` (blood → hemoglobin, CBC, plasma, platelet, serum, glucose, lipid…). Add a row when a query misses.
- **iOS** can't search other apps' files. ArchiveOS searches its own Documents folder, which you fill with the Files app (On My iPhone › ArchiveOS). It matches names and plain-text contents only.

## Layout

```text
app/index.html       UI: markup, styles, shelf engine, transitions, meadow
app/core.js          pure logic + 43-file demo dataset (tested with node:test)
src-tauri/src/lib.rs commands: search_files, open_file, reveal_file, quick_look (+ unit tests)
specs/001-archiveos/ spec, plan, research, contracts, tasks
tests/               core.test.js (node), ui.spec.js (Playwright)
```

## Known limits

- Only the top 6 content matches get snippets (each costs about 0.25 s of Spotlight work). The rest show without one (follow-up T902).
- The iOS version has no folder picker yet, because Tauri's dialog plugin can't pick folders on mobile (T901). Native actions report "not available on iOS yet".
- Open / Quick Look / Reveal on real files are checked by hand, not by tests (T900).
- Fonts load from Google Fonts. Offline, the page falls back to Georgia / system UI.
