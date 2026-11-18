# Plan: own index, pill hero, origin-aware entry

## Technical Context
Rust 2021 + Tauri 2; new crates: rusqlite (bundled, FTS5), notify, pdf-extract, zip. Swift OCR helper built like the speech helper. Frontend stays `app/index.html` + `app/landing.js` + `app/core.js`.

## Constitution Check
| Principle | Status |
|---|---|
| I Spec-first | this folder before code |
| II Test-first | cargo tests for query building, extractors, indexing, search, summaries; UI tests for hero timeline, origin expansion, labels, vaults |
| III Simplicity | see Complexity Tracking; skipped from the brief: trash, dirs, chrono, serde_json, jwalk, quick-xml (std / existing code covers them) |
| IV Security | terms validated; FTS query is built from validated words; asset scope `$HOME/**` not `/**`; paths checked as before |
| V Honest failures | index errors logged with the path; status pills are the owner's fixed text (owner decision); live state in the Mac Finder Sync panel |

## Design
- `index.rs` (new module): schema, `fts_query(terms)`, `extract_text(path)`, `index_paths`, `search`, `summary`. Writer thread fed by a channel from the crawler and the watcher.
- Commands keep their names: `search_files` and `vault_summary` read the index (Spotlight content fallback while Phase 2 runs); new `index_status`.
- Events: `fs-index-ready` (Phase 1 done), `fs-index-updated` (watcher or Phase 2 batch).
- OCR: `src-tauri/ocr/main.swift` (Vision, VNRecognizeTextRequest accurate), one image path per stdin line → one line of text out.
- Hero: `landing.js` draws the scene into the pill canvas; desk canvas inside the pill; WAAPI timeline in index.html.

## Complexity Tracking
| Addition | Why |
|---|---|
| rusqlite, notify, pdf-extract, zip | owner decision: own index with live updates and in-file text |
| OCR helper (Swift) | Vision has no Rust API; reuses the speech helper's build path |
