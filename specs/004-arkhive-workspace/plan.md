# Implementation Plan: Arkhive workspace start, boxed Sort / File types, follow-ups

**Branch**: `004-arkhive-workspace` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

## Summary

Replace the WebGL prism hero with a canvas pixel-art workspace (`app/landing.js`), move SORT and FILE TYPES under the wordmark and make them press-only and uppercase, then close the open follow-ups: lazy snippets, move to folder, rename undo, batch rename and Trash, tray card removal, export destination, Full Disk Access check, native speech on macOS, refresh on focus, and an iOS folder picker plugin.

## Technical Context

**Language/Version**: Rust 2021 (Tauri 2), vanilla JS in one page, Swift 6 for two small native pieces.
**Primary Dependencies**: tauri 2, serde, drag (macOS). No new crates. `three` is removed.
**Storage**: none (Spotlight is the index; iOS bookmarks in `UserDefaults`).
**Testing**: `node --test` (core.js), Playwright (page with stand-in folder and stand-in backend), `cargo test`, `swiftc -typecheck`.
**Target Platform**: macOS 13+ desktop; iOS 16+; browser preview (Chrome/Edge).
**Constraints**: no own index; validation at every command boundary; no data loss on move/rename/trash.

## Constitution Check

| Principle | Status |
|---|---|
| I. Spec-first | spec.md, plan.md, tasks.md written before code. |
| II. Test-first | Each slice starts with failing tests (core, UI, cargo). Hand checks for TCC prompts, speech and iOS picker are listed in quickstart.md with a follow-up task. |
| III. Simplicity | Removes three.js and hero.js. Folder dialog via `osascript` (no dialog plugin); speech helper is one Swift file; no new crates. See Complexity Tracking. |
| IV. Security | New commands validate paths (`check_file`, `check_dir`) and names; `move_file` never overwrites; no asset protocol scope; terms validated. Personal data: none leaves the machine. |
| V. Honest failures | Access status, speech permission and batch failures are reported by name. |

## Design

### Start screen (`app/landing.js`)
- One canvas, art pixel = 4 CSS px (3 on narrow windows), `image-rendering: pixelated`, redrawn per frame only for clouds, flower and the laptop screen (static layers cached in an offscreen canvas, rebuilt on resize).
- Laptop and notebook are a second small canvas inside a `<button id="desk">`, so they have a real hit area and a screen rect (`Landing.screenRect()`) for the dive.
- API: `Landing.init({ reduce, onEnter })`, `Landing.frame(dt)`, `Landing.screenRect()`, `Landing.resize()`.
- DETAILS panel: markup in index.html, filled from `summary`, `access_status` and `updateCount`.

### Sort / File types
- `.tools` row positioned under `#sbox` (`top: 76px`), shifted by 40px while search is open (`body[data-search]`).
- Press-only: hover rules removed; `data-open` drives the width.
- core.js: `SORT_KEYS` gains `nameDesc`; `sortVaults(cats, summary, by)`; `formatCounts(files)`.
- Vault shelf FILE TYPES: choosing a type calls the existing `openCategory(key)`; ALL FILES opens a new `ALL` category (all extensions).

### Backend commands (lib.rs)
| Command | Notes |
|---|---|
| `snippet(path, terms)` | `file_text` + `snippet_around`; terms validated. |
| `move_file(path, dir)` | `check_file`, `check_dir`, refuse same dir, `free_name`, `fs::rename`; returns new record. |
| `choose_folder(prompt)` | macOS: `osascript -e 'POSIX path of (choose folder with prompt …)'`; cancel → `None`. Prompt is a fixed set chosen by key, never page text in the script. |
| `export_files(paths, dest?)` | dest validated with `check_dir`. |
| `access_status()` | `read_dir` on the three roots; FDA probe reads `~/Library/Safari` listing (TCC-protected). |
| `open_privacy_settings()` | `open x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles`. |
| `speech_start()` / `speech_stop()` | spawns `arkhive-speech` next to the executable; JSON lines → `speech` events. |
| ROOTS | add Movies. |

### Native speech helper
`src-tauri/speech/main.swift`: SFSpeechRecognizer + AVAudioEngine, prints `{"t":"partial|final|error|ready","text":…}`. Built by `build.rs` with `swiftc` into `src-tauri/binaries/arkhive-speech-<triple>` before `tauri_build::build()`, declared as `externalBin`. Usage strings already in Info.plist (R9).

### iOS folder picker (T901)
`src-tauri/plugins/folder-picker` — a Tauri mobile plugin: Swift `UIDocumentPickerViewController(forOpeningContentTypes: [.folder])`, bookmark saved to `UserDefaults`, `startAccessingSecurityScopedResource` kept for the app's lifetime; commands `pick_folder`, `folders`. Rust iOS `list_dir`/`search` include the returned paths.

## Complexity Tracking

| Addition | Why | Simpler alternative rejected |
|---|---|---|
| Swift speech helper (sidecar) | WebKit speech does not run in app webviews (R9) | objc2 bindings to Speech/AVFoundation from Rust: far more code |
| iOS plugin (Swift package) | iOS folder access needs UIKit picker + bookmarks | none: no Rust API for the picker |
| `osascript` folder dialog | one line, no dependency | `tauri-plugin-dialog`: a new crate for one dialog |
