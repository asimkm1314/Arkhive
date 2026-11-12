# Tasks: Arkhive — prism hero, real files, pop-out search, inline pills, file actions

**Input**: specs/003-arkhive-prism/ (spec.md, plan.md, research.md, contracts/commands.md, quickstart.md)

**Tests**: Required (constitution II). Each test task is written and seen failing before its implementation task.

## First pass (done 2026-11-12, kept)

- [X] T100–T118 Demo data moved to `tests/fixtures/`; browser folder reader; first hero, hairline search, pills and click-to-open; logic and UI suites green. The second pass below replaces the hero, the pills and the UI tests, and closes what the first pass left out of the brief.

## Phase 1: Setup

- [X] T120 Add `three` 0.160.0 to `package.json` (exact), script `vendor` that copies its ES module to `app/vendor/`; add `NSAppleEventsUsageDescription` to `src-tauri/Info.plist`

## Phase 2: Foundational

- [X] T121 [P] Failing tests in `tests/core.test.js`: `expandTerms(['blood'])` includes `donor`; `pathCrumbs` for a home path, a non-home path and a root file; `storyAt(p)` gives stage and progress within it, clamped
- [X] T122 [P] Failing Rust tests in `src-tauri/src/lib.rs`: `summarize` counts files only, sums bytes, picks the newest; `ROOTS` holds the four folders; `valid_file_name` accepts and rejects per the contract; `rename_in_place` renames, refuses a taken name, allows a case-only change, refuses a folder; `trash_args` ends with the path and never embeds it; `quicklook_png` returns PNG bytes for a repo icon and rejects a bad size
- [X] T123 Implement `pathCrumbs`, `storyAt`, the `donor` synonym in `app/core.js`
- [X] T124 Implement in `src-tauri/src/lib.rs`: `vault_summary`, `thumbnail`, `rename_file`, `trash_file` (+ ignored live Trash test), Pictures root; remove `count_files`

## Phase 3: User Story 1 — prism scroll story (P1)

- [X] T125 Failing UI tests in `tests/ui.spec.js`: nav has back, mark, three links; six cards and a drawn ring; wheel steps the headline and the cue; "How it works" and back step the story, back disabled at stage one; scrolling past "Now" opens `tier1`; a real pointer click on a card opens the vault with that vault pulled out; Presets opens the smart group; blocked library → flat row with painted cards that still opens; reduced motion → cards hold still; median frame under 50 ms headless
- [X] T126 Implement `app/hero.js` (ring, shader, story, parallax, hover, fallback, card placement) and the hero markup, styles and card painting in `app/index.html`

## Phase 4: User Story 2 — real files (P1)

- [X] T127 Failing UI tests: browser path (no folder, picked folder, deep drill, refused folder, real image preview on a cover); desktop path with a stub backend (spines show counts and sizes from `vault_summary`, "showing N of M" when capped, "Count failed" with the reason, FOLDERS lists four roots, cover and inspector show the backend's preview)
- [X] T128 Implement summaries, previews and the capped-shelf note in `app/index.html`

## Phase 5: User Story 3 — pop-out search (P1)

- [X] T129 Failing UI tests: hairline 48×1; wordmark, `/` and hover open it; Escape and outside click fold it only when empty; placeholder mentions OCR; mic button is named for "Hey Arkhive"
- [X] T130 Implement the search box and fix the phone layout of the top bar in `app/index.html`

## Phase 6: User Story 4 — pills (P2)

- [X] T131 Failing UI tests: labels `SORT · RELEVANCE` and `FILES · ALL`; hover widens; marker sits behind the current option; a choice folds the pill while still hovered and updates the label; FILES filters; Folders only on folder shelves; open pill stays inside a 390px window
- [X] T132 Implement the pills in `app/index.html`

## Phase 7: User Stories 5 and 6 — open and manage (P2)

- [X] T133 Failing UI tests: browser click → inspector + reason; no play control; folder click drills; path crumbs open that folder; Rename and Trash say they need the desktop app. Desktop stub: click → `open_file` called and inspector open; rename flow (stem selected, Enter renames everywhere, Escape cancels, a refused name shows the reason); Trash arms on the first press, moves on the second, file leaves shelf and tray
- [X] T134 Implement click-to-open, rename, Trash and path crumbs in `app/index.html`

## Phase 8: Carry-over and polish

- [X] T135 UI tests for voice, tray (add once, copy paths, clear, drag the cover onto the tray) and the reduced-motion flow on the new page
- [X] T136 Design pass with the `impeccable` polish checklist: desktop and phone screenshots, states, focus, contrast; run its detector once on the finished page. Detector result: label text raised from 10.5px to 11px; two findings kept on purpose (Inter on the hero and 25px pills, both pinned by the brief)
- [X] T137 Full suites: `npm test`, `npm run test:ui`, `cargo test`, `cargo check --target aarch64-apple-ios`
- [X] T138 Update `README.md`
- [ ] T930 Follow-up (hand checks on a Mac, quickstart.md): H1, H2, C1, P1, O1, R1, T1, T2, F1. T2 was tried on 2026-11-12 and stopped after 50 s waiting on what is almost certainly the macOS "control Finder" prompt, so the live Trash move is unconfirmed
- [ ] T931 Follow-up: a "move to folder" picker in the inspector
- [ ] T932 Follow-up: undo for rename; batch rename and Trash from the tray

Carried and still open: T900–T902, T904–T909.
