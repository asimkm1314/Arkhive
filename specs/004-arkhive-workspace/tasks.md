# Tasks: Arkhive workspace start, boxed Sort / File types, follow-ups

Each slice: write the tests, see them fail, implement, see them pass.

## Slice A — Sort / File types and labels (US2)
- [x] T040 core tests: `nameDesc` sort, `sortVaults`, `formatCounts`, ALL category
- [x] T041 core.js: implement T040
- [x] T042 UI tests: both buttons visible on vault and file shelf, under the wordmark, press-only, option lists, counts, vault FILE TYPES opens a shelf, vault SORT reorders, search open moves them, labels uppercase with no brackets
- [x] T043 index.html: `.tools` row, press-only pills, uppercase bold boxed labels, vault sort and type actions

## Slice B — Workspace start screen (US1)
- [x] T044 UI tests: start screen content, ENTER / laptop / notebook / Enter open the vault, DETAILS unfolds with real facts, back folds into the laptop, reduced motion, no canvas
- [x] T045 app/landing.js: scene, desk canvas, screen rect, frame loop
- [x] T046 index.html: landing markup and styles, DETAILS panel, wire enter/back; remove hero.js, three vendor file and `three` dev dependency

## Slice C — Inspector and tray follow-ups (US3)
- [x] T047 cargo tests: `move_into` (same dir refused, no overwrite), `export_into` with destination, snippet command validation, batch rename name plan
- [x] T048 lib.rs: `snippet`, `move_file`, `choose_folder`, export destination
- [x] T049 UI tests: lazy snippet, move to folder, undo rename, tray remove card, rename all, trash all, export to…
- [x] T050 index.html: implement T049

## Slice D — Access, live counts, native speech (US4)
- [x] T051 cargo tests: access status shape, ROOTS include Movies, speech line parser
- [x] T052 lib.rs: `access_status`, `open_privacy_settings`, `speech_start`/`speech_stop`, Movies
- [x] T053 speech/main.swift + build.rs + externalBin
- [x] T054 UI tests: access line + settings button, refresh on focus, native speech path with a stand-in event
- [x] T055 index.html: implement T054

## Slice E — iPhone folder picker (US5)
- [x] T056 iOS folder picker: `gen/apple/Sources/archiveos/FolderPicker.swift` exposes two C functions called from Rust; no plugin crate needed
- [x] T057 lib.rs iOS: include picked folders in roots and search
- [x] T058 `npm run tauri ios build -- --debug --target aarch64-sim`

## Finish
- [x] T059 Run all suites, `cargo check --target aarch64-apple-ios`, `npm run tauri build -- --debug --bundles app`
- [x] T060 README, quickstart (hand checks: W1 start screen on hardware, A1 Full Disk Access, S1 native speech, M1 move, I1 iOS picker), mark 001–003 follow-ups done
- [ ] T906 Follow-up (owner decision): Android target, deferred for disk space
- [ ] T933 Follow-up: iPhone webview frame stops ~107 pt above the bottom of the screen (white band); page and window background colours do not reach it
- [ ] T934 Follow-up (hand checks, quickstart.md): W1, A1, S1, M1, E1, I1, F1
