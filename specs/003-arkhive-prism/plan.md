# Implementation Plan: Arkhive — prism hero, real files, pop-out search, inline pills, file actions

**Branch**: `003-arkhive-prism` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

## Summary

The page stays plain HTML and JavaScript. The hero moves into its own script (`app/hero.js`): a WebGL ring drawn with three 0.160.0 and one custom shader, a scroll-bound story, and a flat fallback. `app/index.html` gets the hairline search, the two widening pills, real previews on covers, and rename, Trash and path crumbs in the inspector. `app/core.js` holds no file data. The backend gains `vault_summary`, `thumbnail`, `rename_file` and `trash_file`, loses `count_files`, and adds Pictures to the browsing roots. Spotlight remains the search source.

## Technical Context

**Language/Version**: JavaScript (ES2022, no build step); Rust stable

**Primary Dependencies**: Tauri 2, `serde`, `drag` 2 (macOS). New: `three` 0.160.0 (browser; vendored ES module in `app/vendor/`, pinned in `package.json`)

**Storage**: None

**Testing**: `node --test` (logic); Playwright on `app/index.html`, in two modes: a stub folder for the browser path, and a stub backend standing in for the desktop app; `cargo test` (backend, including real rename on temp files and a real Quick Look thumbnail)

**Target Platform**: macOS 13+; iPhone 17+ (its own Documents folder; rename, Trash and previews report "not available")

**Performance Goals**: hero median frame under 20 ms; vault summaries off the main thread; one preview request per pulled-out cover

**Constraints**: works from `file://`; hero falls back when WebGL or the library is unavailable; no opacity fades inside the vault

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Spec-first | PASS | spec.md, plan.md, tasks.md precede the code they describe |
| II. Test-first | PASS with note | Failing tests first for logic, backend and both UI modes. Live-Mac checks stay by hand (quickstart; T930): Finder Trash with its permission prompt, real Spotlight counts, real previews on covers, the hero on hardware. The Trash has an opt-in live test (`cargo test -- --ignored`). |
| III. Simplicity | PASS with justification | One new browser dependency (three). No React, GSAP, Lenis, Tailwind, SQLite, `trash`, `dirs`, `chrono` or asset-protocol scope. See Complexity Tracking. |
| IV. Security at boundaries | PASS, **review these** | (1) **Rename and Trash change the owner's files.** Both check the path (absolute, exists, is a file). Rename validates the new name and refuses any name already taken. Trash goes through Finder, so the file is recoverable. (2) The Trash path is passed to `osascript` as an argument, never inside the script text. (3) Previews are returned as bytes for one validated path; the asset protocol with a `**` scope from the brief is not enabled, since it would let page content read any file. (4) New usage string: `NSAppleEventsUsageDescription`. |
| V. Honest failures | PASS | "Counting" / "Count failed" with the reason, never a made-up number. Rename and Trash failures name the file and the reason; nothing reports success it did not have. A missing preview is a normal state and keeps the drawn cover; preview errors are logged. |

## Project Structure

```text
app/
├── index.html              # markup, CSS, shelf engine, pills, search, inspector, tray, voice
├── hero.js                 # the prism hero: WebGL ring, shader, scroll story, fallback
├── core.js                 # pure logic, no file data
└── vendor/three.module.min.js   # copied from node_modules by `npm run vendor`
src-tauri/src/lib.rs        # + vault_summary, thumbnail, rename_file, trash_file; − count_files
src-tauri/Info.plist        # + NSAppleEventsUsageDescription
tests/
├── fixtures/demo-folder.js # stand-in folder for tests only
├── core.test.js
└── ui.spec.js              # stub folder (browser path) and stub backend (desktop path)
```

**Structure Decision**: One new source file, `hero.js`, because the hero is a self-contained WebGL program of about 350 lines with its own state; keeping it out of the page keeps both readable.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `three` 0.160.0 | FR-003: a 16-sample dispersion shader on six planes in a tilted ring | CSS cannot sample a texture along a motion vector; raw WebGL would mean hand-writing matrix, shader and texture plumbing |
| Vendored 670 KB library file | FR-007: the desktop app must draw its first screen offline | CDN-only made the opening screen depend on the network |
| Third frontend file (`hero.js`) | See Structure Decision | One 2,000-line page |
| Not using the brief's React / R3F / GSAP / Lenis / Tailwind / SQLite stack | Owner left the stack open ("whichever looks and feels better") and kept Spotlight | Each would add a build step or a second system doing what the page and Spotlight already do |
