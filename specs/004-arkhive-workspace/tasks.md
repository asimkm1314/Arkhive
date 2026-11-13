# Tasks: Arkhive workspace start, boxed Sort / File types, follow-ups

Each slice: write the tests, see them fail, implement, see them pass.

## Slice A — Sort / File types and labels (US2)
- [ ] T040 core tests: `nameDesc` sort, `sortVaults`, `formatCounts`, ALL category
- [ ] T041 core.js: implement T040
- [ ] T042 UI tests: both buttons visible on vault and file shelf, under the wordmark, press-only, option lists, counts, vault FILE TYPES opens a shelf, vault SORT reorders, search open moves them, labels uppercase with no brackets
- [ ] T043 index.html: `.tools` row, press-only pills, uppercase bold boxed labels, vault sort and type actions

## Slice B — Workspace start screen (US1)
- [ ] T044 UI tests: start screen content, ENTER / laptop / notebook / Enter open the vault, DETAILS unfolds with real facts, back folds into the laptop, reduced motion, no canvas
- [ ] T045 app/landing.js: scene, desk canvas, screen rect, frame loop
- [ ] T046 index.html: landing markup and styles, DETAILS panel, wire enter/back; remove hero.js, three vendor file and `three` dev dependency

## Slice C — Inspector and tray follow-ups (US3)
- [ ] T047 cargo tests: `move_into` (same dir refused, no overwrite), `export_into` with destination, snippet command validation, batch rename name plan
- [ ] T048 lib.rs: `snippet`, `move_file`, `choose_folder`, export destination
- [ ] T049 UI tests: lazy snippet, move to folder, undo rename, tray remove card, rename all, trash all, export to…
- [ ] T050 index.html: implement T049

## Slice D — Access, live counts, native speech (US4)
- [ ] T051 cargo tests: access status shape, ROOTS include Movies, speech line parser
- [ ] T052 lib.rs: `access_status`, `open_privacy_settings`, `speech_start`/`speech_stop`, Movies
- [ ] T053 speech/main.swift + build.rs + externalBin
- [ ] T054 UI tests: access line + settings button, refresh on focus, native speech path with a stand-in event
- [ ] T055 index.html: implement T054

## Slice E — iPhone folder picker (US5)
- [ ] T056 plugins/folder-picker (Rust + Swift), registered on iOS only
- [ ] T057 lib.rs iOS: include picked folders in roots and search
- [ ] T058 `npm run tauri ios build -- --debug --target aarch64-sim`

## Finish
- [ ] T059 Run all suites, `cargo check --target aarch64-apple-ios`, `npm run tauri build -- --debug --bundles app`
- [ ] T060 README, quickstart (hand checks: W1 start screen on hardware, A1 Full Disk Access, S1 native speech, M1 move, I1 iOS picker), mark 001–003 follow-ups done
- [ ] T906 Follow-up (owner decision): Android target, deferred for disk space
