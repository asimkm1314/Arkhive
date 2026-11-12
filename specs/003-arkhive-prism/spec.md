# Feature Specification: Arkhive — prism hero, real files, pop-out search, inline pills, file actions

**Feature Branch**: `003-arkhive-prism`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "Arkhive: open on a 3D prism-card scroll story on black. Remove every demo file; show the owner's real Mac files, counts and previews. Clicking ARKHIVE pops out a hidden search bar. Two pills, SORT and FILES, widen inline to reveal their options. Clicking the pulled-out file opens it directly, with no play button. The inspector can rename a file, move it to the Trash, and jump to any folder in its path. Keep Spotlight as the search source."

Builds on `specs/001-archiveos` and `specs/002-arkhive`. Where this spec changes them, this one wins. Carried over unchanged: search by contents, sort and filter rules, export tray, drag-out, drop-in, voice, folder listing, and all backend validation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open on a prism scroll story (Priority: P1)

On launch the owner sees a black stage: a floating navigation bar, a large headline top-left, the next stage's name dim and blurred top-right, a tick ruler on the right edge, and a tilted ring of six file cards turning slowly. Scrolling moves through four stages (Raw capture, Optical grading, Finished artwork, Now). The ring turns with the scroll, and the faster it turns the further each card smears into a spectrum: amber behind, green in the middle, cyan and blue ahead. Resting the pointer on a card stops the ring and shows that card sharp and slightly larger. A card click, the Archive link, or scrolling past the last stage grows that card to fill the window and opens the vault.

**Why this priority**: It is the first impression and the way into everything else.

**Independent Test**: Load the app, scroll, and watch the headline change stage by stage; keep scrolling past "Now" and the vault opens.

**Acceptance Scenarios**:

1. **Given** the app launches, **When** the hero renders, **Then** it shows the navigation bar (back button, ARKHIVE with its mark, links Presets, How it works, Archive), the headline "Raw capture", the cue "Optical grading", the ruler, and six cards in a ring that turns without input.
2. **Given** the hero, **When** the owner scrolls, **Then** the headline steps through the four stages, the cue always names the stage after the current one, and the ring turns with the scroll.
3. **Given** the ring is turning quickly, **When** it is drawn, **Then** each card is smeared along its direction of travel with warm colours trailing and cool colours leading; at rest the cards are sharp.
4. **Given** the hero, **When** the pointer rests on a card, **Then** the ring stops and that card is drawn sharp at 1.08 times its size.
5. **Given** the hero, **When** the owner clicks a card, **Then** the card expands to fill the window and the category shelf opens with that card's vault pulled out.
6. **Given** the hero, **When** the owner scrolls past the "Now" stage, or chooses Archive, **Then** the vault opens.
7. **Given** the hero, **When** the owner chooses "How it works", **Then** the story moves on one stage; the back button moves it back one, and is disabled at the first stage.
8. **Given** the hero, **When** the owner chooses "Presets", **Then** the vault opens showing only the smart vaults.
9. **Given** a browser without WebGL, or the 3D library cannot load, **When** the app launches, **Then** the six cards appear as a flat row with the reason in the hint line, and the vault still opens from them.

---

### User Story 2 - See only real files (Priority: P1)

Everything on screen comes from the owner's files. In the desktop app that is the home folder as Spotlight sees it, with Desktop, Documents, Downloads and Pictures as the browsing roots. Each vault shows its real file count and total size. The pulled-out cover and the inspector show a real preview of the file. In the browser preview the owner chooses a folder and the app reads it. Nothing about any file is written into the app.

**Why this priority**: The brief requires it; a file manager that shows stand-in files is not one.

**Independent Test**: In the desktop app, compare a vault's count with the same search in Finder. In the browser, choose a folder and check that exactly its files appear.

**Acceptance Scenarios**:

1. **Given** the desktop app, **When** the vault shelf is shown, **Then** each vault shows "Counting" and then its real number of files and their total size.
2. **Given** a vault holds more files than a shelf shows, **When** it is opened, **Then** the shelf says how many of the total it is showing.
3. **Given** a file is pulled out on a file shelf, **When** a preview of it exists, **Then** its cover shows that preview instead of a drawn placeholder; the inspector shows it too.
4. **Given** the FOLDERS vault in the desktop app, **When** it is opened, **Then** it lists Desktop, Documents, Downloads and Pictures.
5. **Given** the browser preview with no folder chosen, **When** the vault opens, **Then** it says "No folder chosen", offers "Choose folder", and shows no file names.
6. **Given** the owner chooses a folder in the browser, **When** it is read, **Then** its files (subfolders up to four levels, 5,000 items) appear on the shelves, images show their real picture, and search covers names and the text of text files.
7. **Given** counting fails, **When** the vault shelf is shown, **Then** the vaults say "Count failed" and the reason is shown; no number is invented.
8. **Given** the app source, **When** it is searched for the test fixture's file names, **Then** none is found outside `tests/`.

---

### User Story 3 - Pop out search from the wordmark (Priority: P1)

The search field is hidden: only a short hairline sits under the ARKHIVE wordmark. Clicking the wordmark, pressing `/` or `⌘K`, or hovering the hairline widens it into a search field with a microphone button. `Escape` or clicking away while it is empty folds it back.

**Why this priority**: Search is the main way to find a file; hiding it keeps the top of the screen clear without putting it further away.

**Independent Test**: Click the wordmark, type "blood related", submit; the results shelf opens. Press Escape on an empty field; the hairline returns.

**Acceptance Scenarios**:

1. **Given** the vault, **When** it is shown, **Then** no search field is visible, only a hairline about 48px wide and 1px high beneath the wordmark.
2. **Given** the vault, **When** the owner clicks the wordmark, presses `/` or `⌘K`, or hovers the hairline, **Then** the field widens in place; the click and the keys also focus it.
3. **Given** the open field is empty, **When** the owner presses Escape or clicks elsewhere, **Then** it folds back to the hairline.
4. **Given** the open field has text, **When** the owner clicks elsewhere, **Then** it stays open.
5. **Given** the field, **When** a query is submitted, **Then** the results shelf opens.

---

### User Story 4 - Sort and filter with two pills (Priority: P2)

Above the shelf sit two pills. Collapsed, they read `SORT · RELEVANCE` and `FILES · ALL`. Hovering, focusing or tapping a pill widens it inline to show its options, with a green block and gold rule sitting behind the current one. Choosing an option moves the block, applies the choice, and folds the pill back to its short label.

**Why this priority**: The same choices as before in a fraction of the space.

**Independent Test**: Hover SORT, choose Name; the shelf sorts, the pill folds back and reads `SORT · NAME`. Choose FILES → PDF; only PDFs remain.

**Acceptance Scenarios**:

1. **Given** a file shelf, **When** the owner hovers, focuses or taps a pill, **Then** it widens to show its options and the marker sits behind the current one.
2. **Given** SORT is open, **When** an option is chosen, **Then** the shelf re-sorts from its first file, the marker moves, and the pill folds back showing the choice, even while the pointer is still on it.
3. **Given** FILES, **When** a format is chosen, **Then** only those files remain; if none remain the empty state shows.
4. **Given** the vault shelf, **When** it is shown, **Then** only FILES appears, offering the vault groups; on a file shelf FILES offers Folders only where folders are listed.
5. **Given** a phone-width window, **When** a pill is open, **Then** it stays inside the window and its options can be scrolled sideways.

---

### User Story 5 - Open a file by clicking it (Priority: P2)

Clicking the pulled-out cover of a file opens the file in its default app and opens the inspector for it. Clicking a pulled-out folder opens that folder on the shelf. There is no play button. Enter and the Inspect control open the inspector without launching the file.

**Why this priority**: One click to the file is what the owner asked for.

**Independent Test**: Click the pulled-out cover of a PDF in the desktop app: Preview opens it and the inspector shows its details.

**Acceptance Scenarios**:

1. **Given** the pulled-out file cover in the desktop app, **When** it is clicked, **Then** the file opens in its default app and the inspector opens.
2. **Given** the pulled-out cover in the browser preview, **When** it is clicked, **Then** the inspector opens and the owner is told that opening files needs the desktop app.
3. **Given** a pulled-out folder cover, **When** it is clicked, **Then** the shelf shows that folder's contents.
4. **Given** any shelf, **When** a play control is looked for, **Then** none exists.

---

### User Story 6 - Manage a file from the inspector (Priority: P2)

In the inspector the owner can rename the file in place, move it to the Trash, and jump to any folder in its path. Renaming never replaces another file. Moving to the Trash takes two presses and can be undone from the Trash.

**Why this priority**: These are the everyday file actions the owner otherwise leaves the app for. They change the owner's files, so they are deliberate and reversible.

**Independent Test**: Rename a file and see the new name on the shelf and in Finder; move a file to the Trash and see it leave the shelf and appear in the Trash with Put Back available.

**Acceptance Scenarios**:

1. **Given** the inspector, **When** the owner chooses Rename (or clicks the file name), **Then** the name becomes editable with the part before the extension selected.
2. **Given** a new name, **When** Enter is pressed, **Then** the file is renamed on disk and the inspector, the shelf and the tray show the new name; Escape leaves the file unchanged.
3. **Given** a name that is empty, contains `/` or `:`, starts with a dot, or belongs to another file in that folder, **When** it is submitted, **Then** nothing is renamed and the reason is shown.
4. **Given** the inspector, **When** the owner presses Move to Trash once, **Then** nothing is moved and the button asks for confirmation; it disarms by itself after a few seconds.
5. **Given** the armed button, **When** it is pressed again, **Then** the file moves to the Trash, the inspector closes, the file leaves the shelf and the tray, and the owner is told it can be put back from the Trash.
6. **Given** the inspector's path, **When** the owner chooses one of its folders, **Then** the inspector closes and the shelf shows that folder.
7. **Given** the browser preview, **When** Rename or Move to Trash is chosen, **Then** the owner is told these need the desktop app.

---

### User Story 7 - Carry over voice, export tray and drag (Priority: P2)

Voice search, the export tray, dragging a file out and dropping files in behave as specified in 002.

**Independent Test**: The 002 flows for voice and the tray pass on the new page.

---

### Edge Cases

- WebGL context lost while the hero is showing → the flat row replaces the ring; the page does not go blank.
- Reduced-motion preference → the ring does not turn by itself and nothing smears; the story still steps with the scroll.
- Touch screens → dragging sideways turns the ring, dragging up or down moves the story, tapping a pill opens it.
- A file with no preview (unknown type, preview fails) → the drawn cover stays; no error is shown for a missing preview.
- A file renamed or deleted outside the app between listing and acting → the action fails with the reason and names the file.
- A rename that changes only letter case → allowed.
- Rename or Trash on a folder → not offered; the inspector opens files only.
- macOS has not yet granted permission to ask Finder to move files → the system prompt appears; if refused, the reason is shown and the file stays where it is.
- A folder with more than 300 entries, a category with no files, a cancelled folder picker, a refused folder → as specified in 002 and above: shown plainly, nothing invented.

## Requirements *(mandatory)*

### Functional Requirements

**Hero**

- **FR-001**: The hero MUST show a black stage with the navigation bar, stage headline, next-stage cue, right-edge ruler and six cards (PDF, PPTX, JPEG, DOCX, XLSX, Folders) arranged around a tilted ring.
- **FR-002**: The ring MUST turn slowly when idle, turn with scroll and with a sideways drag, and stop while a card is hovered.
- **FR-003**: Each card MUST be drawn by sampling its image at 16 offsets along its direction of travel, colouring the samples from amber (trailing) through green to cyan and blue (leading), with the offset length following the ring's speed and the card's edges feathering out at speed.
- **FR-004**: The story MUST have four stages bound to scroll; the headline MUST show the current stage, the cue the next one, and the ruler the progress.
- **FR-005**: The vault MUST open from a card, from Archive, from Enter, and from scrolling past the last stage, by a clip-path expansion from the card's on-screen rectangle.
- **FR-006**: Card faces MUST be drawn at run time from the vault's name, real count and, when one exists, a real preview of its newest file. No image or file data may be stored in the source.
- **FR-007**: The 3D library MUST be a pinned release (three 0.160.0), loaded from the app's own files, with the same version from a CDN only when the page is opened straight from disk. If neither loads, the flat row MUST be used.

**Real files**

- **FR-008**: The app MUST NOT contain file names, sizes, dates or contents outside `tests/`.
- **FR-009**: The desktop app MUST report, for every vault, the real number of matching files, their total size and the newest one, using the same rules as the shelf that vault opens.
- **FR-010**: Every number shown MUST be real, or the word "Counting", or "Count failed" with the reason.
- **FR-011**: The system MUST produce a preview image for a file on request (desktop: from the operating system's preview service; browser: the image itself for image files) and show it on the pulled-out cover and in the inspector.
- **FR-012**: The FOLDERS vault MUST start at Desktop, Documents, Downloads and Pictures.
- **FR-013**: In the browser the owner MUST be able to choose a folder; the app reads names, sizes, dates, and the first 256 KB of text-based files, and MUST say that PDF and image text is not read there.

**Search and pills**

- **FR-014**: The search field MUST stay folded into a hairline under the wordmark until opened by the wordmark, `/`, `⌘K` or hover, and MUST fold back on Escape or an outside click only when empty.
- **FR-015**: The shelf MUST show at most two pills, SORT and FILES. Each MUST widen inline on hover, focus or tap, show a marker behind the current option, and fold back after a choice.
- **FR-016**: SORT MUST offer Relevance, Name (A–Z), Date (newest), Date (oldest), Size. FILES MUST offer All, PDF, PPTX, JPEG, DOCX, XLSX, Code, Folders on file shelves, and the vault groups on the vault shelf.
- **FR-017**: "blood" MUST also match donor, alongside the related words already listed in 001.

**Open and manage**

- **FR-018**: Clicking the pulled-out file cover MUST open the inspector and, in the desktop app, open the file in its default app. No play control may exist.
- **FR-019**: Rename MUST change only the file's name within its folder, MUST refuse a name that is empty, longer than 255 bytes, contains `/`, `:` or a control character, starts with a dot, or is taken by another file, and MUST NOT replace any existing file.
- **FR-020**: Move to Trash MUST require two presses, MUST move the file to the system Trash so it can be put back, and MUST NOT delete it.
- **FR-021**: Rename and Move to Trash MUST act on files only, and every path MUST be checked (absolute, exists, is a file) before use.
- **FR-022**: The inspector MUST show the file's folder path as a list of folders, each opening that folder on the shelf.

**Throughout**

- **FR-023**: Every failure MUST be shown with its reason. A missing preview is not a failure.
- **FR-024**: All text MUST be English; the two-dot cursor from 002 stays; inside the vault, motion uses transforms, clip-path and masks, never opacity fades. The hero may fade and blur its text, as the brief describes.

### Key Entities

- **Vault summary**: for one vault, the number of files, their total size, and the newest file.
- **Preview**: an image of a file, held in memory for the session.
- **Story position**: how far through the four stages the owner has scrolled.
- **Pill state**: which pill is open, and the current sort and format.
- **Folder choice (browser)**: the folder the owner picked and what was read from it, held in memory for the session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The hero's median frame takes under 20 ms on a recent Mac while the ring turns (checked by a frame-timing test, and by hand on hardware).
- **SC-002**: From launch, the owner reaches a vault in one action and a named file's inspector in three.
- **SC-003**: The source outside `tests/` contains 0 fixture file names.
- **SC-004**: Every vault count in the desktop app equals the number of files its shelf rules select, or the shelf states how many of that total it shows.
- **SC-005**: A renamed file is found under its new name in Finder, and no other file in the folder has changed.
- **SC-006**: A file moved to the Trash is in the Trash with Put Back available; 0 files are deleted outright.
- **SC-007**: 0 silent failures across hero, counts, previews, search, pills, open, rename and trash.

## Assumptions

- Decided by the owner on 2026-11-11 and again on 2026-11-12: Spotlight stays the search source; no index is built. The owner left the frontend stack to "whichever looks and feels better": the page stays plain HTML and JavaScript and gains one library, three, for the hero.
- The stage names (Raw capture, Optical grading, Finished artwork, Now) are taken from the brief as written.
- "Presets" means the smart vaults (Medical / Health, Projects). "How it works" steps the story.
- The category shelf keeps the two smart vaults from 002 in addition to the ten the brief lists.
- Moving a file to another folder is done by dragging it out; a "move to" picker is out of scope.
- The Trash is reached by asking Finder, which shows a one-time macOS permission prompt and gives Put Back.
- Previews in the desktop app come from the operating system's own preview service, so they exist for whatever file types the Mac can preview.
- In the browser the inspector shows the folder's own path; only the desktop app knows the home folder and shortens it to `~`.
- Rename and Trash are Mac-only; on iPhone they report that they are not available yet.
- Arkhive's own index, a folder picker in the desktop app, Full Disk Access checks and Android stay out of scope (owner decisions of 2026-11-11).
