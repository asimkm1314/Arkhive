---
description: "Task list for Arkhive"
---

# Tasks: Arkhive — rebrand, desktop entry, folders, voice, export

**Input**: Design documents from `specs/002-arkhive/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/commands.md, quickstart.md

**Tests**: Required by the constitution (principle II). Each test task is written and seen failing before its implementation task.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Add `drag = "2"` under `[target.'cfg(target_os = "macos")'.dependencies]` in `src-tauri/Cargo.toml` and update `Cargo.lock`; create `src-tauri/Info.plist` with `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`; add both plus `CFBundleDisplayName` = Arkhive to `src-tauri/Info.ios.plist`; set `productName` and window `title` to Arkhive in `src-tauri/tauri.conf.json`

## Phase 2: Foundational (blocks all stories)

Carries the three review fixes left failing on `001-archiveos` (FR-028) and the shared data changes.

- [X] T002 In `tests/core.test.js`: rewrite the word-boundary review test to use an inline keyword category (FINANCE is removed); add failing tests for the 12 category keys in order, `categoryOf('pptx') === 'PPTX'`, `categoriesForTab('smart')` = MEDICAL, PROJECTS
- [X] T003 [P] Failing Rust tests in `src-tauri/src/lib.rs`: `valid_term` accepts `रक्त` and `血` and still rejects `blood"`; `build_query` name clause is `"t*"cdw`; `name_has_word("Release_Notes.md", "lease")` is false and `("Lease_2026.pdf", "lease")` true
- [X] T004 Implement in `app/core.js`: tokens keep `\p{M}`; one-character CJK tokens kept; name match at word start; Projects keyword `repo` → `repository`; category list per data-model.md
- [X] T005 Implement in `src-tauri/src/lib.rs`: `valid_term`, `build_query`, `name_has_word`; add `kind` and `mode` to `FileHit`
- [X] T006 Update `app/index.html` (PPTX pill and art case, remove FINANCE art) and `tests/ui.spec.js` (PPTX, smart tab leaves 2) so all three suites are green

## Phase 3: User Story 1 — Arkhive identity (P1) 🎯 MVP

**Independent test**: walk landing → tier1 → tier2 → detail; wordmark reads ARKHIVE, no CJK anywhere, pointer is two dots.

- [X] T007 [US1] Failing UI tests in `tests/ui.spec.js`: top bar wordmark is `ARKHIVE`; page title is `Arkhive`; no CJK character in the page's text or font links on any of the four views; `#cursor` has exactly two dots and gains class `on` over a button
- [X] T008 [US1] Implement in `app/index.html`: remove CJK labels and the Noto font link; wordmark with gold dot (Inter Tight 800); double-dot cursor (follow rate 22, spread and recolour on interactive items); title

## Phase 4: User Story 2 — Laptop entry (P1)

**Independent test**: wide window → lid opens, vault button reaches tier1; narrow window → tap bar reaches tier1.

- [X] T009 [P] [US2] Failing UI tests in `tests/ui.spec.js`: laptop screen shows menu bar with clock, 5 file icons and 2 folder icons, welcome window with the demo count, dock; vault button and Enter → `tier1`; PDF icon → `tier2` with only PDFs; welcome search "blood related" → `tier2` with blood files; 390×844 viewport shows the phone scene and its bar → `tier1`; `Back to desktop` → `landing`
- [X] T010 [P] [US2] Failing Rust test in `src-tauri/src/lib.rs`: `count_args(home)` asks for `-count` over Desktop, Documents and Downloads
- [X] T011 [US2] Implement the entry scene in `app/index.html`: CSS 3D laptop with lid animation, desktop (menu bar, icons, welcome window, dock), 3-layer pointer parallax in the rAF loop, phone scene at ≤767px, dive from the screen rect with optional target (category or query); delete the meadow canvas code
- [X] T012 [US2] Implement `count_files` in `src-tauri/src/lib.rs`; show its result (or "counting") in the welcome window

## Phase 5: User Story 3 — Folders (P1)

**Independent test**: FOLDERS → Documents → subfolder → path bar back to Documents.

- [X] T013 [P] [US3] Failing tests in `tests/core.test.js`: `demoDir(files, null)` returns Desktop, Documents, Downloads as folders; `demoDir(files, '~/Documents')` lists subfolders before files, each once; `sortFiles` keeps folders first in every mode; `filterFormat` for `FOLDERS` and `XLSX`
- [X] T014 [P] [US3] Failing Rust tests in `src-tauri/src/lib.rs`: `list_entries` on a temp folder skips dot-names, puts folders first, sets `kind` and `mode`, reports `total`; rejects a relative path, a missing path and a file path
- [X] T015 [P] [US3] Failing UI tests in `tests/ui.spec.js`: FOLDERS vault lists Desktop, Documents, Downloads; opening Documents lists its folders and the path bar reads FOLDERS › Documents; a crumb click returns to that level; FOLDERS and XLSX pills narrow; an empty folder shows the empty state
- [X] T016 [US3] Implement `demoDir`, folder-first sorting and the two filters in `app/core.js`
- [X] T017 [US3] Implement `list_dir` in `src-tauri/src/lib.rs`
- [X] T018 [US3] Implement in `app/index.html`: folder covers and spines, drill-down on open, path bar in the context line, folder empty and error states, new pills

## Phase 6: User Story 4 — Voice (P2)

**Independent test**: simulated speech "hey arkhive find the file which has blood related" opens the blood results.

- [X] T019 [P] [US4] Failing tests in `tests/core.test.js` for `parseVoice`: wake phrases (incl. "archive" spelling), filler stripped, no wake → null, wake only → `""`
- [X] T020 [P] [US4] Failing UI tests in `tests/ui.spec.js` with a stub recogniser: `V` and the mic button toggle `data-mic`; the pill shows the words; the wake phrase opens `tier2` from the landing and from `tier1`; a phrase with no wake phrase does nothing; no recogniser → toast says voice is unavailable and the search field is focused; `V` in the search field types a letter
- [X] T021 [US4] Implement `parseVoice` in `app/core.js`
- [X] T022 [US4] Implement in `app/index.html`: mic controls (top bar, search field, welcome window), voice pill, recogniser lifecycle with restart and error reasons, voice-driven navigation

## Phase 7: User Story 5 — Export and import (P2)

**Independent test**: add two files to the tray, copy paths, clear.

- [X] T023 [P] [US5] Failing tests in `tests/core.test.js` for `trayAdd`: adds, ignores a duplicate path, ignores a folder
- [X] T024 [P] [US5] Failing Rust tests in `src-tauri/src/lib.rs`: `stat_list` validates and keeps order; `export_into(parent, paths)` creates `Arkhive Export` then `Arkhive Export 2`, copies files, renames a repeated name, leaves originals intact, rejects a folder and an empty list
- [X] T025 [P] [US5] Failing UI tests in `tests/ui.spec.js`: the add button puts the active file in the tray (name, format, size); adding it again keeps one card; Copy paths writes one path per line (clipboard stubbed); Export and Reveal all say they need the desktop app; Clear empties and hides the tray; dragging the pulled-out cover onto the tray adds it; a folder is refused
- [X] T026 [US5] Implement `trayAdd` in `app/core.js`
- [X] T027 [US5] Implement `stat_paths`, `export_files`, `start_native_drag` in `src-tauri/src/lib.rs` and register all new commands
- [X] T028 [US5] Implement in `app/index.html`: tray markup and actions, add button by the active cover, pointer-driven file drag from the active cover and inspector preview (see research R18), native drag in the app, `tauri://drag-drop` handling (tray, folder, "Dropped" shelf)

## Phase 8: User Story 6 — Inspector (P3)

**Independent test**: open a content-matched PDF; badge, permissions, `~` path and tray action are right.

- [X] T029 [P] [US6] Failing tests in `tests/core.test.js`: `formatPerms(0o644)` = `rw-r--r--`, `formatPerms(0o755)`; `tilde`; `matchKind`
- [X] T030 [P] [US6] Failing UI tests in `tests/ui.spec.js`: badge says text match inside the file for a content hit and name match for a name hit; details line has permissions; path starts with `~`; "Add to export tray" adds the file
- [X] T031 [US6] Implement the helpers in `app/core.js` and the inspector changes in `app/index.html`; demo files get `kind` and `mode`

## Phase 8b: Found during implementation

- [X] T035 Failing UI test, then fix in `app/index.html`: clicking the pulled-out cover does nothing in Chrome, because Chrome does not hit-test it (present in 001 too). The cover is now found by its on-screen rect for click, hover, tilt and drag (research R18)

## Phase 9: Polish

- [X] T032 `prefers-reduced-motion` covers the lid, dive, tray and pill in `app/index.html`; extend the reduced-motion UI test through the new entry and the tray
- [x] T033 Run `npm test`, `npm run test:ui`, `cargo test`, `cargo check --target aarch64-apple-ios`, and `npm run tauri build -- --debug --bundles app` (done in specs/004-arkhive-workspace)
- [x] T034 Update `README.md`: name, entry, folders, voice, tray, limits (done in specs/004-arkhive-workspace)
- [ ] T904 Follow-up (documented skip): automate the hand checks in quickstart.md (V1, D1, D2, D3, X1), which need a live Mac session
- [x] T905 Follow-up: native speech recognition command, if hand check V1 shows the webview's speech input does not work (done in specs/004-arkhive-workspace)
- [ ] T906 Follow-up: Android target
- [x] T907 Follow-up: Full Disk Access check and settings link (done in specs/004-arkhive-workspace)
- [x] T908 Follow-up: real-folder picker for the browser preview (done in specs/004-arkhive-workspace)
- [x] T909 Follow-up: remove a single card from the tray; choose the export destination (done in specs/004-arkhive-workspace)

Carried from 001 and still open: T900, T901, T902.

## Dependencies

- Setup → Foundational → US1 → US2 → US3. US4 and US5 need US2 (entry controls) and US3 (folder records). US6 needs US5 (tray).
- Within a story: tests → core.js → lib.rs → index.html.

## Parallel opportunities

- In each story the test tasks marked [P] touch different files (`core.test.js`, `lib.rs`, `ui.spec.js`).

## Implementation strategy

MVP = Phases 1–3 (green suites, new identity). Then US2 → US3 → US4 → US5 → US6, running all suites after each phase.
