# Implementation Plan: Arkhive — rebrand, desktop entry, folders, voice, export

**Branch**: `002-arkhive` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-arkhive/spec.md`

## Summary

The same two-file page and one Rust file as ArchiveOS, extended. `app/core.js` gains the pure logic (category list, demo folder tree, voice phrase parsing, tray, display helpers) and the three review fixes. `app/index.html` swaps the meadow for a CSS 3D laptop and a phone entry scene, the ring cursor for two dots, and adds the folder path bar, the voice controller, the export tray and drag handling. `src-tauri/src/lib.rs` gains five commands: `list_dir`, `stat_paths`, `count_files`, `export_files`, `start_native_drag`. Spotlight stays the search source.

## Technical Context

**Language/Version**: JavaScript (ES2022, no build step); Rust stable

**Primary Dependencies**: Tauri 2, `serde`. New: `drag` 2.1 (Mac only). Dev: `@tauri-apps/cli`, `@playwright/test`

**Storage**: None

**Testing**: `node --test` (logic), `cargo test` (validation, listing, export, query building), Playwright on the demo page (UI flows; speech and clipboard simulated)

**Target Platform**: macOS 13+; iOS 17+ (app's Documents folder only)

**Project Type**: desktop app with a mobile target

**Performance Goals**: 60 fps entry scene and shelf; folder listing under 0.5 s for 300 entries; file count under 1 s

**Constraints**: No opacity animation; works from `file://`; English-only interface; no network beyond the two Google Fonts stylesheets already used

**Scale/Scope**: One user; lists capped at 300; tray capped at 300

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Spec-first | PASS | spec.md, plan.md and tasks.md exist before code |
| II. Test-first | PASS with note | Logic, backend and UI flows get failing tests first. Four behaviours need a live Mac session and stay hand checks in quickstart.md with follow-up T904: real microphone input (V1), drag-out into Finder (D1), drop onto our own tray (D2), drop-in from Finder (D3). |
| III. Simplicity | PASS with justification | One new dependency, justified below. No database, no plugins, no dialog. |
| IV. Security at boundaries | PASS | Every path from the page is checked in Rust before use (absolute, exists, and folder/file as the command requires). Export creates a new folder and never overwrites. Processes get argument arrays, never a shell. **Callouts for review**: (1) the app can now list any folder whose path the page sends; the page is our own local file and loads no remote script. (2) Voice sends audio to the platform speech service while the mic is on; the app stores and sends nothing itself. (3) Two new privacy usage strings in the plists. |
| V. Honest failures | PASS | Voice, drag, tray, export and listing errors reach the owner as a toast with the reason. Export reports how many files were copied before a failure. The welcome window shows a real count or "counting", never a fixed figure. The brief's "FULL DISK ACCESS" label is not shown, because the app does not have it. |

Post-design re-check: PASS (no new violations from data model or contracts).

## Project Structure

### Documentation (this feature)

```text
specs/002-arkhive/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/commands.md
└── tasks.md
```

### Source Code (repository root)

```text
app/
├── index.html        # markup, CSS, entry scene, shelf, voice, tray, drag
└── core.js           # pure logic + demo dataset
src-tauri/
├── Cargo.toml        # + drag (macOS target only)
├── tauri.conf.json   # productName, window title
├── Info.plist        # new: macOS privacy usage strings
├── Info.ios.plist    # + usage strings, display name
└── src/lib.rs        # + 5 commands and their tests
tests/
├── core.test.js
└── ui.spec.js
```

**Structure Decision**: Unchanged from 001. No new source files besides `Info.plist`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New dependency `drag` | FR-021: hand a real file to another Mac app by dragging | The web drag API cannot export a file path from a webview. Writing `NSDraggingSession` by hand is unsafe Objective-C in far more than "a few lines". |
| Two frontend files, not the brief's one | Carried from 001: logic must load in `node --test` | Same as 001 |
