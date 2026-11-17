---
description: "Task list for ArchiveOS"
---

# Tasks: ArchiveOS — tactile shelf file search

**Input**: Design documents from `specs/001-archiveos/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/commands.md, quickstart.md

**Tests**: Required by the constitution (principle II). Each test task is written and seen failing before its implementation task.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Create `package.json` (scripts `test`, `test:ui`, `tauri`; devDeps `@tauri-apps/cli`, `@playwright/test`), run `npm install`, commit `package-lock.json`, add `.gitignore` (`node_modules/`, `src-tauri/target/`, `src-tauri/gen/`, `test-results/`, `.env*`)
- [X] T002 [P] Create `playwright.config.js` using `channel: 'chrome'`, tests in `tests/`, matching `*.spec.js`
- [X] T003 [P] Scaffold `src-tauri/` by hand: `Cargo.toml` (tauri 2, serde, serde_json; no plugins), `build.rs`, `src/main.rs`, `tauri.conf.json` (`frontendDist: "../app"`, `withGlobalTauri: true`, identifier `dev.archiveos.app`), `capabilities/default.json` (`core:default`), `Info.ios.plist` with `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace`; generate icons with `tauri icon`

## Phase 2: Foundational (blocks all stories)

- [X] T004 Write failing tests in `tests/core.test.js` for `categoryOf(ext)` (pdf→PDF, pptx/key→PPT, heic→JPEG, md→DOCX, csv→XLSX, rs→CODE, mov→MEDIA, dmg→ZIP), and shelf math `B(r)`, `openness(r)`, `wrapRel(v, s, n)` (normalised to [-n/2, n/2]), `xPos(r, ws, d, gap)`
- [X] T005 Implement those in `app/core.js` as a classic script exposing `globalThis.ArchiveCore` and `module.exports`; include `CATEGORIES` (12, per data-model.md) and `DEMO_FILES` (≥36 files across PDF, PPT, JPEG, DOCX, XLSX, CODE; ≥5 blood-related, ≥2 only by contents, e.g. `Scan_Nov_10.pdf`, `IMG_4092.JPG`)
- [X] T006 Build the page shell in `app/index.html`: tokens, fonts, paper grain, top bar, custom cursor, the shared shelf engine (one rAF loop, spring `k=5.2/18`, cuboid faces, shading, lift, tilt, 3 copies, wheel/drag/touch/arrow input), masked 3-line caption and action ring; expose `document.body.dataset.view`

## Phase 3: User Story 1 — Find a file by what is inside it (P1) 🎯 MVP

**Independent test**: search "blood related" on demo data → every blood-related demo file, each with a snippet.

- [X] T007 [P] [US1] Failing tests in `tests/core.test.js`: `cleanQuery` ("find the file which has blood related" → ["blood"]; ≤16 terms; ≤40 chars), `expandTerms` (blood → hemoglobin, cbc, …), `searchDemo` (finds all blood files incl. content-only; name hits outrank content hits; no unrelated files; snippet contains a term), empty-result case
- [X] T008 [P] [US1] Failing Rust tests in `src-tauri/src/lib.rs`: `valid_term`, `valid_ext`, `build_query` (term clause, ext clause, days clause, combined), `decode_md_string` (`\n`, `\"`, `\\`, `\U25c7`), `snippet_around`, `skip_path` (dot-dirs, Library, node_modules, target)
- [X] T009 [P] [US1] Failing UI tests in `tests/ui.spec.js`: `/` focuses search; "blood related" → view `tier2` lists `CBC_Blood_Panel_Report_Nov2026.pdf` and `Scan_Nov_10.pdf`; filler-only query does not submit; "zzqx" shows "NO FILES MATCH"
- [X] T010 [US1] Implement `cleanQuery`, `expandTerms`, `searchDemo`, `snippetFor` in `app/core.js`
- [X] T011 [US1] Implement `search_files` in `src-tauri/src/lib.rs` (macOS: parallel `mdfind` per term, score per research R2, metadata, `mdimport` snippets for top 6 content hits; iOS: walk Documents dir, names + plain-text contents; validation per contracts/commands.md)
- [X] T012 [US1] Wire the search slot, `⌘K`/`/`, the Tier 2 sheet expansion from the active cover, the results shelf with snippet bars, and the empty state in `app/index.html`; call `invoke('search_files')` when `window.__TAURI__` exists, else `searchDemo`; show backend errors

## Phase 4: User Story 2 — Browse files by format (P1)

**Independent test**: open PDF → only PDFs; back returns to PDF selected.

- [X] T013 [P] [US2] Failing tests in `tests/core.test.js`: `filesInCategory(files, cat, now)` for format, smart, and RECENT (7 days); `categoriesForTab(tab)` for ALL/DOCS/MEDIA/CODE/SMART
- [X] T014 [P] [US2] Failing UI tests in `tests/ui.spec.js`: Tier 1 has 12 categories; tab `SMART CLUSTERS` leaves 3; opening PDF gives only `.pdf` files; `← ALL CATEGORIES` returns to `tier1` with PDF active; ArrowRight moves the active category
- [X] T015 [US2] Implement `filesInCategory`, `categoriesForTab` in `app/core.js`
- [X] T016 [US2] Implement the Tier 1 shelf, category filter tabs with sliding indicator, open-category → Tier 2 sheet, collapse back, in `app/index.html` (backend: `search_files` with `exts`/`days`/cluster keywords)

## Phase 5: User Story 3 — Sort and narrow (P2)

**Independent test**: on "blood" results, NAME (A–Z) orders alphabetically; PDF pill leaves only PDFs.

- [X] T017 [P] [US3] Failing tests in `tests/core.test.js`: `sortFiles` (relevance, name, newest, oldest, largest; stable), `filterFormat`
- [X] T018 [P] [US3] Failing UI tests in `tests/ui.spec.js`: sort NAME reorders shelf; PDF pill filters; a pill with no files shows the empty state
- [X] T019 [US3] Implement `sortFiles`, `filterFormat` in `app/core.js`
- [X] T020 [US3] Implement Tier 2 sort tabs + format pills with sliding indicator and glide-to-first in `app/index.html`

## Phase 6: User Story 4 — Inspect and act (P2)

**Independent test**: open `CBC_Blood_Panel_Report_Nov2026.pdf` → details, highlighted snippet; Escape returns.

- [X] T021 [P] [US4] Failing tests in `tests/core.test.js`: `highlight(text, terms)` escapes HTML and wraps terms in `<mark>`; `formatSize`, `formatDate`
- [X] T022 [P] [US4] Failing Rust tests in `src-tauri/src/lib.rs`: `check_path` rejects relative and missing paths, accepts an existing temp file
- [X] T023 [P] [US4] Failing UI tests in `tests/ui.spec.js`: Enter on active file → view `detail` with name, size, highlighted `blood`; `OPEN IN DEFAULT APP` shows "needs the desktop app"; Escape → `tier2`
- [X] T024 [US4] Implement `highlight`, `formatSize`, `formatDate` in `app/core.js`
- [X] T025 [US4] Implement `open_file`, `reveal_file`, `quick_look` in `src-tauri/src/lib.rs` (macOS `open`, `open -R`, `qlmanage -p`; iOS error)
- [X] T026 [US4] Implement the inspector in `app/index.html`: clip-path expansion from the cover rect, masked staggered lines, SVG ink-blot preview (7 blobs, feTurbulence + feDisplacementMap), generated file preview art, action bar, close animation

## Phase 7: User Story 5 — Landing scene (P3)

**Independent test**: load page, press Enter → `tier1`.

- [X] T027 [P] [US5] Failing UI tests in `tests/ui.spec.js`: initial view `landing`; Enter → `tier1`; `VOICE / SEMANTIC SEARCH` → `tier1` with search focused; `BACK TO MEADOW` → `landing`
- [X] T028 [US5] Implement the pixel meadow canvas (sky, drifting clouds, tree, skyline, laptop, binder), status pills, hero copy, buttons, and the clip-path dive in `app/index.html`

## Phase 8: Polish

- [X] T029 `prefers-reduced-motion`: shorten every transition in `app/index.html`; UI test that the flow still reaches `detail`
- [X] T030 Run all suites (`npm test`, `npm run test:ui`, `cargo test`), `cargo check --target aarch64-apple-ios`, `npm run tauri build -- --debug --bundles app`, and `tauri ios build --debug --target aarch64-sim` to verify both apps bundle
- [X] T031 `README.md`: what it is, how to run, scope cuts, iOS notes
- [ ] T900 Follow-up (documented skip): automate native-action checks (needs a live Finder/Quick Look); manual steps in quickstart.md until then. Real-Spotlight search is covered by the opt-in test `live_spotlight_finds_file_by_contents` (`cargo test -- --ignored`) in src-tauri/src/lib.rs
- [x] T901 Follow-up: iOS document-picker plugin with security-scoped bookmarks so iOS can search any folder the owner picks (done in specs/004-arkhive-workspace)
- [x] T902 Follow-up: lazy snippet for the active file in src-tauri/src/lib.rs (only the top 6 content hits get snippets today, to keep search near 2 s) (done in specs/004-arkhive-workspace)

## Dependencies

- Setup → Foundational → US1…US5. US1 and US2 both need T006 (shelf engine). US3 and US4 need a Tier 2 shelf (T012 or T016). US5 only needs T006.
- Within a story: tests → core.js → lib.rs → index.html.

## Parallel opportunities

- T002, T003 in parallel with T001.
- In each story, the test tasks marked [P] touch different files (`core.test.js`, `lib.rs`, `ui.spec.js`) and can be written together.

## Implementation strategy

MVP = Phases 1–3 (search works end to end on demo data and real Spotlight). Then US2 → US3 → US4 → US5, running all suites after each phase.
