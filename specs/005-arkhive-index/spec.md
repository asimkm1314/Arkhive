# Feature Specification: Arkhive own index, pill hero, origin-aware entry

**Feature Branch**: `005-arkhive-index` | **Created**: 2026-11-14 | **Status**: Draft

**Input**: Owner brief (2026-11-14): ARK · [PILL] · HIVE hero with the workspace scene inside the pill and a 2.1 s opening; the vault grows out of whichever element was clicked; SQLite FTS5 index with a two-phase crawler, content extraction, OCR and a live watcher; DESKTOP / DOCUMENTS / DOWNLOADS vaults; bracketed button labels; three floating status pills; unsandboxed app with the asset protocol.

Builds on 001–004; where it differs, this spec wins.

## Owner decisions (2026-11-14)

- **Own index replaces Spotlight as the search source** (reverses R8). Spotlight stays only as a fallback for content while the first content pass is still running.
- **Start screen = the brief's pill hero**, exactly as written (replaces 004's centred scene). The three floating status pills come back; button labels use brackets.
- **Vaults**: add DESKTOP, DOCUMENTS, DOWNLOADS; keep the other 13.
- Kept from earlier specs: macOS privacy prompts cannot be skipped by any app (sandbox off does not change that); the access check stays, reachable from the "Mac Finder Sync" nav link.

## User Stories & Acceptance

### US1 Pill hero (P1)
1. On launch the page starts on #F5EFE6; over 2.1 s the pill grows hairline → slit → circle → 2:1 stadium (widths 0.012 / 0.16 / 1.81 / 3.62 fs), ARK and HIVE move apart, the nav slides down, the footer rises, the rule draws from the centre, and 15 cream/gold S-curves sit on the paper.
2. Inside the pill: drifting clouds over the meadow, the laptop with notebook and pen bottom-right, three status pills above the laptop screen.
3. Footer: drop-cap paragraph left, rule middle, ENTER ARKHIVE pill button right.
4. Pressing ENTER ARKHIVE grows the vault from the button's own rectangle (round 999px); the laptop, the notebook or the pill grows it from that element's rectangle (round 24px); 880 ms, cubic-bezier(.76, 0, .18, 1). Back folds the vault into the same element.
5. Reduced motion: the timeline ends at once in its final state; every flow still completes.

### US2 Own index (P1)
1. On launch, Phase 1 indexes names, sizes and dates under Desktop, Documents, Downloads and Pictures (3 levels) and the shelf can show them; then the rest of the home folder (skipping hidden folders, Library, node_modules, target, .git).
2. Phase 2 extracts text from PDF, DOCX, PPTX, XLSX, CSV, text and code files, and OCR text from JPEG, PNG and HEIC, into SQLite FTS5.
3. Searching "find the file which has blood related" ranks name hits above content hits and returns a snippet for every content hit.
4. A file added, changed, renamed or deleted in Finder updates the index and the shelf counts within seconds.
5. While Phase 2 is running, content search also asks Spotlight so nothing is missed.

### US3 Vault and chrome (P2)
1. DESKTOP, DOCUMENTS, DOWNLOADS vaults open those folders.
2. SORT and FILE TYPES sit just above the shelf; labels read "[ SORT · … ]", "[ FILE TYPES · … ]", "[ ← LANDING ]", "[ ← ALL VAULTS ]".
3. The top bar shows "MAC FINDER: <count> FILES" from the index and a mic status badge.
4. JPEG and PNG covers load straight from disk through the asset protocol.

### US4 Everything Finder shows (P1, owner report 2026-11-15: "it doesn't have all the folders, files, docs")
1. FOLDERS lists every visible home folder, iCloud Drive and Applications.
2. Apps and libraries (.app, .photoslibrary, …) are single items, never walked into.
3. Shelves and folder listings hold up to 20,000 items; the shelf draws at most 48 boxes.
4. Verified 2026-11-15 on the owner's Mac: 13,145 Finder-visible items in the home folder, 0 missing from the index.

### US5 Clean landing (P1, owner brief 2026-11-15)
1. The landing shows only the gold/cream curves on beige paper, one continuous "ARKHIVE" word in the centre, "ENTER ARKHIVE" at the bottom centre, and the laptop with the notebook in the bottom-right corner.
2. The pill, the three green status pills, the drop-cap paragraph, the footer rule and the top nav and status line are gone.
3. Clicking ARKHIVE, ENTER ARKHIVE, the laptop or the notebook grows the vault out of that element; back folds it into the same element.
4. The folder picker and privacy settings (formerly in the Mac Finder Sync panel) stay reachable from the vault's access line.

### US6 Files open inside Arkhive (P1, owner report 2026-11-15: "it shouldn't go back to Finder")
1. Clicking a file's cover shows it in a viewer inside Arkhive; nothing opens in Finder or another app.
2. PDF, images, video and audio show directly from disk; Word, PowerPoint, Excel and CSV are converted by macOS Quick Look into a page; RTF and DOC by textutil; text and code files are read as text (up to 2 MB).
3. A file the viewer cannot show says so and offers "Open in default app" as an explicit choice.
4. Converted documents are shown in a sandboxed frame with no scripts and no access to Arkhive's commands.
5. Escape or the close button returns to the shelf.

### US7 Plain labels, HOME, the word through the lines, a lifting button (P1, owner brief 2026-11-16)
1. No button, pill or label shows a literal "[" or "]" ("ENTER ARKHIVE", "SORT · …", "FILE TYPES · …", "← HOME", "← ALL VAULTS", "← BACK", "OPEN IN DEFAULT APP"). Supersedes the bracket labels of US3.2.
2. The vault's top-left back button reads "← HOME" and folds the vault back into the element it grew from.
3. On open, the curves are two layers: 9 behind the word (drawn over 1500 ms) and 6 in front. ARKHIVE travels from behind and below-left (translate3d(-18vw, 14vh, -260px) rotate(-6deg) scale(.82), clipped) through the lines to dead centre over 800 ms (cubic-bezier(.16, 1, .3, 1); owner 2026-11-18: shorter); then the front layer drops behind it.
4. ENTER ARKHIVE sits at bottom 5.5vh, rises 40 px into place (500 ms, 300 ms delay), lifts 4 px and grows 2% on hover with a deeper shadow, a gold border and a label that rolls to "ENTER ARKHIVE →"; it presses down on click (owner 2026-11-18: the hover was too much). Entering the vault takes 600 ms.
5. A document Quick Look cannot lay out shows its text with a note saying so (live check 2026-11-16: Downloads/BDA PPT.pptx).

### US8 Someone downloads Arkhive (P1, owner 2026-11-18: "when someone downloads this app for their mac it should be able to access their files")
1. The release build is a .dmg with an ad-hoc signed app (no Developer ID yet, owner decision), its OCR and speech helpers inside and signed.
2. macOS's one-time Desktop, Documents and Downloads prompts say why Arkhive reads them.
3. A refused folder is named in the vault with the settings button and "then reopen Arkhive".
4. The README gives the install steps, including Open Anyway.

### US9 Motion that keeps up (P1, owner 2026-11-18: ran /review-animations, "apply the fixes")
1. Sheets (vault, file shelf, inspector, viewer) open in 450 ms and fold back in 300 ms on the drawer curve cubic-bezier(.32, .72, 0, 1).
2. Captions and labels roll in 180 ms; the inspector text reveals in 300 ms with 40 ms steps.
3. The search field opens at once from `/` or ⌘K; by pointer it opens in 200 ms. SORT and FILE TYPES unfold in 220 ms; their marker slides by transform.
4. The voice pill moves in 200 ms; the toast in 400 ms `ease`.
5. The ENTER ARKHIVE hover lift and label roll (250 ms) run only for a fine pointer that can hover.
6. With reduced motion, sheets fade in 200 ms instead of growing, and the shelf steps without sliding.

## Requirements
- FR-001 DB at the app data folder `arkhive_real_index.db`, WAL, synchronous NORMAL, busy_timeout 5000.
- FR-002 One writer thread; readers open their own connections.
- FR-003 Extraction never crashes the app (a failing file is recorded as done with no text).
- FR-004 Search terms validated as before; FTS query built only from validated terms.
- FR-005 Asset protocol scope limited to the home folder.
- FR-006 `preview_doc` and `read_text` validate the path like every other command (absolute, existing regular file), cap the text size, and time out the converter after 20 s; converted pages are cached under the app cache folder keyed by path and modified time.

## Success Criteria
- SC-001 Shelf shows real files within 1 s of launch on a warm index.
- SC-002 All suites pass; extraction and query building have unit tests.
