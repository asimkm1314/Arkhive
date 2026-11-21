# Tasks: 005

## A Index (US2)
- [x] T100 cargo tests: fts_query, docx/pptx/xlsx/text extraction, skip rules, index + search ranking + snippets, summary by exts/days/keywords, delete on remove
- [x] T101 index.rs + Cargo deps; commands read the index
- [x] T102 crawler (two phases) + writer thread + events
- [x] T103 OCR helper + wiring; notify watcher
## B Frontend (US1, US3)
- [x] T104 UI tests: hero timeline end state, pill contents, footer, origin expansion (button vs computer), back to origin, labels with brackets, tools above shelf, folder vaults, MAC FINDER count
- [x] T105 hero markup/CSS/timeline; landing.js draws into the pill
- [x] T106 vault chrome changes; asset-protocol covers; index events refresh counts
## D Landing clean-up (US5)
- [x] T108 UI tests: landing contents, centred ARKHIVE, bottom-centre button, bottom-right desk, origin expansion from each, no pill/nav/footer text
- [x] T109 markup/CSS/timeline; landing.js draws the desk only
## E In-app viewer (US6)
- [x] T110 cargo tests: preview kind by extension, read_text cap and validation
- [x] T111 lib.rs: `preview_doc` (qlmanage / textutil, cached), `read_text`; iOS stubs
- [x] T112 UI tests: cover click opens the viewer (pdf iframe, image, text, converted doc in sandboxed srcdoc), unsupported state, Escape closes, no open_file call
- [x] T113 index.html viewer
## F Labels, HOME, motion (US7)
- [x] T114 live check: every vault lists what it counts on the owner's index; real decks convert (cargo test -- --ignored live_vaults)
- [x] T115 UI tests: no brackets anywhere, ← HOME, two curve layers, title and button timelines, hover lift, text fallback in the viewer
- [x] T116 index.html: labels, curve layers, title pass-through, button
- [x] T117 review-animations pass (owner ran it 2026-11-18: Block; findings fixed in H)
## G Distribution (US8)
- [x] T118 usage strings, ad-hoc signing, dmg target, reopen hint (UI test), README install
- [x] T119 release build: codesign verify, helpers inside, usage strings in the bundle, app launches
- [ ] T120 (owner, later) Developer ID signing and notarization
## H Motion review fixes (US9)
- [x] T121 UI tests: sheet durations and curve, caption roll, inspector reveal, instant keyboard search, pill marker by transform, voice pill and toast timing, hover gating, reduced-motion fade and shelf step
- [x] T122 index.html motion fixes
## I Soft edges (US10)
- [x] T123 UI tests: radii, shadows, press state, focus cue, touch targets unclipped
- [x] T124 index.html soft edges
## J Dark mode (US11)
- [x] T125 UI tests: toggle, remembered choice, reveal from the button, reduced-motion crossfade, contrast
- [x] T126 index.html dark tokens, toggle, view transition
## C Finish
- [x] T107 all suites, app build, launch on the owner's Mac, README
- [ ] T906 Android (deferred; owner 2026-11-15: keep as backup, do not build yet)
