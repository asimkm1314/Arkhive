# Feature Specification: Arkhive — beige workspace start, boxed Sort / File types, follow-ups

**Feature Branch**: `004-arkhive-workspace`

**Created**: 2026-11-13

**Status**: Draft

**Input**: Owner brief (2026-11-13): "Stage 0 illustrated workspace in Soft Beige, Mocha, Forest and Dull Gold with ARKHIVE and Enter Arkhive in the centre and the open laptop and leather book bottom-right; Sort and File types buttons that unfold their options; click ARKHIVE to pop out search; no play button; English only; double-dot cursor; unsandboxed backend that indexes every file." Plus: "do the follow-up tasks".

Builds on `specs/001-archiveos`, `specs/002-arkhive` and `specs/003-arkhive-prism`. Where this spec changes them, this one wins.

## Owner decisions (2026-11-13)

- **Search stays on Spotlight.** No SQLite index, crawler, watcher, extractors or OCR helper (third time confirmed; see research R8). The brief's crawler goals are met by Spotlight plus a refresh when the window comes back into focus.
- **The black prism hero is replaced** by the beige illustrated workspace. `hero.js` and the vendored three.js are removed.
- **Every label and button is bold UPPERCASE, boxed, with no square brackets.**
- **No floating status pills over the laptop.** A DETAILS button under ENTER ARKHIVE opens the live status instead; nothing floats in empty space.
- **Sort and File types sit directly under the ARKHIVE wordmark and its search line**, visible on both shelves.
- **Android (T906) is deferred** for disk space; the owner wants a reminder each session. The iOS folder picker (T901) is built now.
- **Kept from earlier specs, against the brief**: no `assetProtocol` scope `/**` (R23: it would let any page content read any file); macOS privacy prompts cannot be bypassed by any app, sandboxed or not, so the app detects missing access and links to the setting instead (FR-016).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Arrive at an illustrated workspace (Priority: P1)

On launch the owner sees a warm beige pixel-art scene: drifting cream clouds, a mocha skyline left of centre, a dirt path with a wooden bench, forest-green hills, an oak tree framing the right edge and a gold wildflower swaying in front. ARKHIVE sits large in the centre with one line under it and an ENTER ARKHIVE button; a DETAILS button sits under that. In the bottom-right an open laptop rests on the grass beside a spiral-bound leather notebook with a pen on it; the laptop screen shows the clouds and a slow wave of file shapes. ENTER ARKHIVE, the laptop, the notebook or Enter opens the vault: a beige sheet grows out of the laptop screen, tilted −3.5°, to fill the window.

**Independent Test**: Load the app; check the title, the subtitle, both buttons, the laptop and the notebook are present; press ENTER ARKHIVE and the vault shelf opens.

**Acceptance Scenarios**:

1. **Given** the app launches, **When** the start screen renders, **Then** it shows ARKHIVE, the subtitle "Every file on your Mac, indexed inside and out across PDF, PPTX, JPEG and folders.", an ENTER ARKHIVE button, a DETAILS button, and a laptop and notebook in the bottom-right.
2. **Given** the start screen, **When** the owner presses ENTER ARKHIVE, clicks the laptop, clicks the notebook, or presses Enter, **Then** a sheet expands from the laptop screen's rectangle to the full window and the vault shelf opens.
3. **Given** the start screen, **When** the owner presses DETAILS, **Then** a panel unfolds under the button with live facts: how many files Spotlight found (or "Counting…"), which formats are read inside, whether macOS gives Arkhive access to its folders, and an example search; pressing DETAILS again folds it.
4. **Given** the vault, **When** the owner chooses the back button, **Then** the sheet folds back into the laptop screen and the start screen returns.
5. **Given** reduced motion, **When** the start screen shows, **Then** clouds and the flower hold still and every flow still completes.
6. **Given** no canvas support, **When** the app launches, **Then** the title, buttons and DETAILS still work over a flat beige ground.

---

### User Story 2 - Sort and File types under the wordmark (Priority: P1)

Directly under ARKHIVE and its search line sit two bold boxed buttons, SORT and FILE TYPES, on the vault shelf and on every file shelf. Pressing one unfolds its options in place; choosing an option applies it and folds the button back, showing the choice in its label.

**Independent Test**: Open the vault; both buttons are visible below the wordmark; press SORT, choose NAME (Z–A), and the shelf reorders; press FILE TYPES and choose PDF.

**Acceptance Scenarios**:

1. **Given** the vault shelf or a file shelf, **When** it shows, **Then** SORT and FILE TYPES are visible directly below the ARKHIVE search line, and neither opens on hover alone.
2. **Given** SORT is pressed, **When** it unfolds, **Then** it offers RELEVANCE, NAME (A–Z), NAME (Z–A), DATE (NEWEST), DATE (OLDEST), SIZE (LARGEST); choosing one reorders the shelf, marks the choice forest green with a gold rule, and folds the button.
3. **Given** FILE TYPES is pressed on a file shelf, **When** it unfolds, **Then** it offers ALL FILES, PDF, PPTX, JPEG / PNG, DOCX / TXT, XLSX / CSV, CODE, FOLDERS, each with how many of the shelf's files it holds; choosing one filters the shelf and folds the button.
4. **Given** FILE TYPES is pressed on the vault shelf, **When** the owner chooses a type, **Then** that type's file shelf opens (ALL FILES opens every file).
5. **Given** SORT on the vault shelf, **When** the owner chooses an order, **Then** the vaults reorder by name, newest file, or total size; RELEVANCE restores the standard order.
6. **Given** the search field pops out, **When** it is open, **Then** SORT and FILE TYPES move down so nothing overlaps.
7. **Given** any screen, **When** labels render, **Then** every button and label is bold uppercase, boxed where it is a button, and no label contains "[" or "]".

---

### User Story 3 - Finish what the inspector and tray started (Priority: P2)

Follow-ups from 001–003: a snippet for any content match, move a file to another folder, undo a rename, rename or trash several files at once from the tray, remove one card from the tray, choose where an export goes.

**Acceptance Scenarios**:

1. **Given** a search where the pulled-out file matched by content but has no snippet, **When** the shelf stops on it, **Then** its snippet is fetched and shown (T902).
2. **Given** the inspector, **When** the owner chooses MOVE TO FOLDER and picks a folder, **Then** the file moves there without replacing any file of the same name, and the inspector shows its new path (T931).
3. **Given** a rename just happened, **When** the owner presses UNDO in its message, **Then** the file gets its old name back (T932).
4. **Given** files in the tray, **When** the owner chooses MOVE ALL TO TRASH and confirms with a second press, **Then** every staged file goes to the Trash and leaves the shelf and the tray (T932).
5. **Given** files in the tray, **When** the owner chooses RENAME ALL and gives a base name, **Then** the files become "<base> 1.ext", "<base> 2.ext", … in tray order, skipping numbers whose names are taken (T932).
6. **Given** a tray card, **When** the owner presses its remove button, **Then** only that card leaves the tray (T909).
7. **Given** files in the tray, **When** the owner chooses EXPORT TO… and picks a folder, **Then** copies go into a new "Arkhive Export" folder inside it (T909).
8. **Given** the browser preview, **When** the owner chooses a folder, **Then** the real system folder picker is used (T908: already met by `showDirectoryPicker`; recorded as done).

---

### User Story 4 - Honest access, native voice, live counts (Priority: P2)

1. **Given** macOS has not given Arkhive Full Disk Access or access to Desktop, Documents or Downloads, **When** DETAILS or the vault shows, **Then** it says which folders are blocked and offers OPEN PRIVACY SETTINGS, which opens the Full Disk Access pane (T907).
2. **Given** the desktop app, **When** the owner turns the mic on, **Then** speech is recognised by macOS's own speech recogniser (not the webview's), with the same wake phrase and errors as before; if macOS refuses the microphone or speech permission, the mic says so (T905).
3. **Given** the owner changed files in Finder, **When** the Arkhive window regains focus, **Then** vault counts refresh, and so does the shelf on show if it lists a vault or folder.
4. **Given** the desktop app, **When** Spotlight is searched, **Then** it covers Desktop, Documents, Downloads, Pictures and Movies.

---

### User Story 5 - iPhone: search a folder the owner picks (Priority: P3)

**Given** the iPhone app, **When** the owner chooses ADD FOLDER and picks a folder in the Files picker, **Then** Arkhive remembers it across launches (security-scoped bookmark) and searches and lists it along with its own Documents folder (T901).

### Edge Cases

- Window resized on the start screen: the scene redraws at the new size; the laptop stays bottom-right and never covers the buttons (on narrow windows it shrinks, below 640px it sits under the buttons).
- Move or export into the folder the file is already in: refused with the reason.
- A chosen folder dialog cancelled: nothing changes, no error message.
- Undo after the file was renamed again or moved elsewhere: refused with the reason.
- Native speech helper missing from the build: the mic falls back to the webview's speech input and says which one it uses.

## Requirements *(mandatory)*

- **FR-001**: The start screen MUST be a canvas-drawn pixel-art scene in the brief's palette only (#EDE6DA, #F5EFE6, #D8CFC0, #261A14, #5C463B, #8A7367, #234434, #3A634C, #B89658).
- **FR-002**: The start screen MUST centre ARKHIVE (Inter Tight 800, `clamp(3.5rem, 7vw, 6.5rem)`, tracking .18em), the subtitle (Newsreader 19px, 48ch), ENTER ARKHIVE (50px tall, forest fill, 1.5px mocha border, 4px offset mocha shadow, gold dot) and DETAILS below it.
- **FR-003**: The laptop (mocha bezel, #D8CFC0 deck, live screen) and the notebook with pen MUST sit bottom-right (`right: 7vw; bottom: 8vh`) and both MUST open the vault.
- **FR-004**: Entering MUST animate a beige sheet from the laptop screen rectangle with `rotate(-3.5deg)` to full screen over 950ms `cubic-bezier(.76, 0, .18, 1)`, using clip-path, never opacity.
- **FR-005**: DETAILS MUST show only real facts; unknown values say "Counting…" or "Unknown".
- **FR-006**: SORT and FILE TYPES MUST sit under the search line on both shelves, open on press only, and close on choice, Escape, or a press outside.
- **FR-007**: Sort orders MUST include Name (Z–A) and apply to vaults as well as files.
- **FR-008**: FILE TYPES options MUST show counts for the shelf on show.
- **FR-009**: All labels MUST be bold uppercase; button labels MUST NOT wrap; no square brackets.
- **FR-010**: `snippet(path, terms)` MUST return the text around the first matching word or nothing, validating terms as `search_files` does.
- **FR-011**: `move_file(path, dir)` MUST refuse a missing or same folder and MUST NOT replace an existing file (it picks "name 2.ext").
- **FR-012**: `choose_folder(prompt)` MUST use the system folder dialog and return nothing when cancelled.
- **FR-013**: Rename undo MUST check the file still exists at the new path before renaming back.
- **FR-014**: Batch rename and batch Trash MUST report per-file failures and keep going.
- **FR-015**: `export_files` MUST accept an optional destination folder, validated like any path.
- **FR-016**: `access_status()` MUST report readability of Desktop, Documents, Downloads and a Full-Disk-Access probe; `open_privacy_settings()` MUST open the Full Disk Access pane.
- **FR-017**: Native speech (macOS) MUST stream partial and final transcripts as events, stop on request, and report permission refusals by name.
- **FR-018**: The iPhone app MUST keep picked folders as security-scoped bookmarks and include them in listing and search.
- **FR-019**: Every file change made by the app (move, rename, trash) MUST update the shelf, tray and counts.

## Success Criteria *(mandatory)*

- **SC-001**: From launch to the vault shelf in one press, under 1.5 s of animation.
- **SC-002**: Both SORT and FILE TYPES are visible on every shelf without hovering (automated check).
- **SC-003**: All logic, UI and backend tests pass; no test skipped without a linked task.
- **SC-004**: No label in the page contains a lowercase letter outside file names, snippets, sentences and the search field (automated check on chrome labels).
