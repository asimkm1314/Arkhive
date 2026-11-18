# Feature Specification: Arkhive — rebrand, desktop entry, folders, voice, export

**Feature Branch**: `002-arkhive`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Arkhive: a tactile 3D file manager and deep content search app for macOS and iPhone. Rename ArchiveOS to ARKHIVE with an English-only interface and a double-dot cursor. Replace the meadow landing with a 3D beige MacBook that opens onto a macOS-style desktop (phone depth screen on mobile) and dives into the shelf. Add real folders to the shelf with drill-down and a breadcrumb. Add hands-free voice search with the wake phrase 'Hey Arkhive'. Let the owner drag files out of the shelf into other Mac apps, stage files in an export tray, and drop files in from Finder. Extend the inspector with permissions and a tray action."

Builds on `specs/001-archiveos`. Everything in that spec stays in force unless this one changes it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the Arkhive identity everywhere (Priority: P1)

The owner opens the app and sees one consistent product: the wordmark ARKHIVE centred in the top bar, every label in English, and a small two-dot pointer in place of the ring cursor.

**Why this priority**: Every other screen in this feature is drawn in this identity. It is also the smallest slice that ships on its own.

**Independent Test**: Load the app, walk landing → category shelf → file shelf → inspector, and check that the wordmark reads ARKHIVE, no label contains Chinese or Japanese characters, and the pointer is two dots that spread and change colour over interactive items.

**Acceptance Scenarios**:

1. **Given** any screen, **When** it is shown, **Then** the top bar shows the wordmark ARKHIVE in its centre with a gold status dot.
2. **Given** any screen, **When** its labels, buttons and badges are read, **Then** all of them are English and none contains Chinese or Japanese characters.
3. **Given** a mouse or trackpad, **When** the pointer moves over a non-interactive area, **Then** it shows as two small dark dots side by side, with no ring and no label.
4. **Given** a mouse or trackpad, **When** the pointer is over a spine, cover, button or desktop icon, **Then** the two dots move further apart, the left turns forest green and the right turns gold.
5. **Given** a touch-only device, **When** the app is used, **Then** no custom pointer is drawn.

---

### User Story 2 - Arrive through a laptop that opens onto a desktop (Priority: P1)

On a Mac the owner sees a beige laptop whose lid swings open to reveal a macOS-style desktop: a menu bar with a live clock, file and folder icons, a welcome window with the file count and a search field, and a dock. Layers shift slightly with the pointer to give depth. On a phone the owner sees a phone-sized entry screen with floating file cards and a "tap to enter" bar. Choosing the vault button, a desktop icon, or submitting a search grows the laptop screen to fill the window and becomes the shelf.

**Why this priority**: It is the first thing the owner sees and the way into everything else. It replaces the meadow scene.

**Independent Test**: Load the app on a wide window and check that the lid opens, the desktop shows its icons, and the vault button reaches the category shelf. Load it on a narrow window and check that the tap bar reaches the category shelf.

**Acceptance Scenarios**:

1. **Given** a window wider than 767px, **When** the app loads, **Then** a laptop lid opens and the screen shows a menu bar, desktop file and folder icons, a welcome window and a dock.
2. **Given** the laptop desktop, **When** the owner chooses "Open Arkhive 3D Vault" or presses Enter, **Then** the screen expands to fill the window and the category shelf appears.
3. **Given** the laptop desktop, **When** the owner chooses a desktop file icon such as the PDF, **Then** the app opens the file shelf for that icon's format.
4. **Given** the welcome window's search field, **When** the owner types a query and submits, **Then** the app opens the search results shelf for that query.
5. **Given** the welcome window in the desktop app, **When** it is shown, **Then** the file count is the real number of files found on this Mac, not a fixed figure. In the browser preview it is the demo file count.
6. **Given** a window 767px wide or narrower, **When** the app loads, **Then** the owner sees the phone entry screen with floating file cards, and tapping the enter bar opens the category shelf.
7. **Given** the category shelf, **When** the owner chooses "Back to desktop", **Then** the entry screen returns.

---

### User Story 3 - Browse real folders on the shelf (Priority: P1)

The category shelf gains a FOLDERS vault. Opening it shows the owner's Desktop, Documents and Downloads as folder boxes. Opening a folder box shows what is inside it, folders first, and a path bar at the top lets the owner jump back to any level.

**Why this priority**: Finding by format and by search already exist. Browsing by location is the missing way in for an app meant to stand in for Finder.

**Independent Test**: Open FOLDERS, open Documents, open a subfolder, then use the path bar to jump back to Documents; each step shows that folder's own contents.

**Acceptance Scenarios**:

1. **Given** the category shelf, **When** it is shown, **Then** it holds 12 vaults: PDF, PPTX, JPEG, DOCX, XLSX, CODE, FOLDERS, MEDICAL / HEALTH, MEDIA, ARCHIVES, PROJECTS, RECENT.
2. **Given** the FOLDERS vault, **When** the owner opens it, **Then** the file shelf shows Desktop, Documents and Downloads as folder boxes.
3. **Given** a folder box, **When** the owner opens it, **Then** the shelf shows that folder's contents with folders before files, and the path bar shows each level of the path.
4. **Given** the path bar, **When** the owner chooses a level, **Then** the shelf shows that level's contents.
5. **Given** a file shelf, **When** the owner chooses the XLSX or FOLDERS format filter, **Then** only spreadsheets or only folders remain.
6. **Given** an empty folder, **When** the owner opens it, **Then** an explicit "this folder is empty" state shows.
7. **Given** a folder the app is not allowed to read, **When** the owner opens it, **Then** the owner sees the reason, and the shelf stays where it was.

---

### User Story 4 - Search by voice (Priority: P2)

The owner turns the microphone on with a button or the `V` key and says "Hey Arkhive, find the file which has blood related". A pill shows the words as they are heard. The app strips the wake phrase and filler words, searches for "blood related", and glides to the results shelf from wherever the owner was.

**Why this priority**: It is a second way to enter a query. Typing already works, so this adds convenience, not capability.

**Independent Test**: With speech input simulated, deliver the phrase "hey arkhive find the file which has blood related" and check that the results shelf opens with the blood-related files.

**Acceptance Scenarios**:

1. **Given** the mic is off, **When** the owner presses the mic button or `V` (outside a text field), **Then** listening starts and the mic control shows it is on.
2. **Given** the mic is on, **When** speech is heard, **Then** a pill shows the words heard so far.
3. **Given** the mic is on, **When** the owner says a phrase that starts with a wake phrase ("hey arkhive", "arkhive", "find", "search", "show me") followed by a request, **Then** the wake phrase and filler words are removed and the remainder is searched.
4. **Given** the entry screen or the category shelf, **When** a voice search runs, **Then** the app moves to the search results shelf.
5. **Given** the mic is on, **When** the owner says a phrase that does not start with a wake phrase, **Then** nothing is searched.
6. **Given** the mic is on, **When** the owner presses the mic button or `V` again, **Then** listening stops and the pill closes.
7. **Given** a device with no speech input, or the owner refuses microphone permission, **When** the mic button is pressed, **Then** the owner is told voice search is unavailable and why, and the search field is focused instead.

---

### User Story 5 - Take files out and bring files in (Priority: P2)

The owner drags the pulled-out file cover off the shelf and drops it on the Mac desktop, Finder, Mail or another app, and that app receives the real file. To gather several files, the owner adds them to a tray that slides up from the bottom, then exports copies to one folder, copies their paths, or reveals them all in Finder. Dropping files from Finder onto the Arkhive window shows them on a shelf.

**Why this priority**: Finding a file is only useful if it can be handed to another app. Open, Quick Look and Reveal already exist, so this is the next step, not the first.

**Independent Test**: Add two files to the tray, check that both cards show name, format and size, copy their paths, and clear the tray.

**Acceptance Scenarios**:

1. **Given** the pulled-out cover of a file in the desktop app, **When** the owner drags it onto another Mac app or the desktop, **Then** that app receives the real file.
2. **Given** a file cover or the inspector, **When** the owner chooses "Add to export tray" or drags the file onto the tray, **Then** the tray slides up and shows a card with the file's name, format and size.
3. **Given** a file already in the tray, **When** it is added again, **Then** the tray still holds it once.
4. **Given** files in the tray, **When** the owner chooses "Copy paths", **Then** the clipboard holds one full path per line.
5. **Given** files in the tray in the desktop app, **When** the owner chooses "Export", **Then** copies of all of them are placed in one new folder, the originals are untouched, and that folder is shown in Finder.
6. **Given** files in the tray in the desktop app, **When** the owner chooses "Reveal all in Finder", **Then** Finder shows them.
7. **Given** files in the tray, **When** the owner chooses "Clear tray", **Then** the tray empties and slides away.
8. **Given** the browser preview, **When** the owner chooses Export or Reveal all, **Then** the owner is told the action needs the desktop app.
9. **Given** the desktop app, **When** the owner drops files from Finder onto the window, **Then** a file shelf shows those files with their details. Dropping a single folder opens that folder on the shelf.

---

### User Story 6 - See more in the inspector (Priority: P3)

The inspector's badge says what kind of match it was, the details line adds the file's permissions, the path is shown relative to the home folder, and an action adds the file to the export tray.

**Why this priority**: Small additions to a screen that already works.

**Independent Test**: Open a content-matched PDF from search results and check the badge, the permissions, the `~` path, and that the tray action adds the file.

**Acceptance Scenarios**:

1. **Given** a file found by its contents, **When** its inspector opens, **Then** the badge names the format and says it was a text match inside the file; for a name match it says so; when browsing it shows the format only.
2. **Given** the inspector, **When** it is shown, **Then** the details line lists size, created date, modified date and permissions.
3. **Given** a file inside the home folder, **When** its inspector opens, **Then** the path starts with `~`.
4. **Given** the inspector, **When** the owner chooses "Add to export tray", **Then** the file appears in the tray.

---

### Edge Cases

- A folder holds more entries than the shelf shows → the first 300 are shown and the owner is told the list was cut.
- Hidden entries (names starting with a dot) → not listed.
- A dropped item that no longer exists, or an export source deleted since it was added → that file is named in an error; nothing is reported as exported that was not.
- Two files in the tray share a name → both are exported; the second gets a numbered name. No file is ever overwritten.
- Export fails part-way (disk full, permission) → the owner is told which file failed and what was already copied; the app does not report success.
- A folder is added to the tray → refused with a message; the tray holds files only.
- Speech input ends on its own while the mic is on (silence timeout) → listening restarts; if it cannot, the mic shows off and the owner is told.
- A voice phrase that is only a wake phrase and filler ("hey arkhive find the file") → nothing is searched.
- The speech service hears "archive" for "Arkhive" → treated as the wake phrase.
- `V` typed inside the search field → types the letter; it does not toggle the mic.
- Dragging a spine or empty shelf space → scrolls the shelf as before; only the pulled-out cover and the inspector preview start a file drag.
- Window resized across 767px while on the entry screen → the matching entry screen is shown; no half-open laptop is left behind.
- Reduced-motion preference → the lid, the dive and the tray complete in shortened form, never stuck mid-animation.
- No pointer movement (keyboard-only use) → the entry screen and shelf are fully usable; depth shift simply stays centred.

## Requirements *(mandatory)*

### Functional Requirements

**Identity**

- **FR-001**: The product name shown to the owner MUST be Arkhive: wordmark in the top bar's centre, window title, and app name.
- **FR-002**: All interface text MUST be English. No interface label or loaded font may be Chinese or Japanese. This does not restrict what the owner may type or say in a query.
- **FR-003**: On devices with a mouse or trackpad the pointer MUST be drawn as two dots that follow the pointer smoothly, and MUST spread apart and change to green and gold over interactive items. The ring cursor and its text label are removed.
- **FR-004**: The interface MUST use the colour and motion values named in the brief (Soft Beige, Deep/Warm/Muted Mocha, Forest Green, Dull Gold), and MUST keep the rule from spec 001 that motion uses geometry, never opacity fades.

**Entry screen**

- **FR-005**: On wide windows the entry screen MUST show a laptop whose lid opens on load to reveal a desktop with a menu bar and live clock, at least five file icons (PDF, PPTX, JPEG, DOCX, XLSX) and two folder icons, a welcome window, and a dock. The meadow scene is removed.
- **FR-006**: The desktop's layers MUST shift with pointer position to give depth, and MUST rest centred when there is no pointer movement.
- **FR-007**: The welcome window MUST show how many files are available (real count in the desktop app, demo count in the browser preview), a search field, and a button that opens the vault.
- **FR-008**: The entry screen MUST lead to the shelf from: the vault button, Enter, a desktop file or folder icon (opening that format or the folders vault), a submitted search, and a voice search.
- **FR-009**: On narrow windows (767px or less) the entry screen MUST instead show a phone-sized scene with layered floating file cards and a bar that opens the vault.
- **FR-010**: Icons and glyphs on the entry screen MUST be Arkhive's own drawings; they MUST NOT copy another company's logo or app icons.

**Folders**

- **FR-011**: The category shelf MUST hold the 12 vaults listed in User Story 3. FOLDERS takes the place of Finance / Legal; PPT is labelled PPTX; ZIP is labelled ARCHIVES.
- **FR-012**: The system MUST list the contents of a folder: name, kind (file or folder), size, created and modified dates, full path and permissions, folders before files, hidden entries left out, at most 300 entries.
- **FR-013**: Opening a folder box MUST show that folder's contents on the same shelf, and a path bar MUST let the owner return to any level above, up to the FOLDERS starting list.
- **FR-014**: File shelves MUST offer format filters ALL, PDF, PPTX, JPEG, DOCX, XLSX and FOLDERS, alongside the existing sort modes.
- **FR-015**: Any folder path that reaches the operating system MUST first be checked: it is a full path, it exists, and it is a folder.

**Voice**

- **FR-016**: A mic control MUST appear in the top bar and beside the search field, showing whether listening is on. `V` MUST toggle it when focus is not in a text field. Listening is off until the owner turns it on.
- **FR-017**: While listening, the system MUST show the words heard so far.
- **FR-018**: The system MUST act only on phrases that begin with a wake phrase ("hey arkhive", "arkhive", their "archive" spellings, "find", "search", "show me"), MUST remove the wake phrase and filler ("can you", "the file which has", "files about", "related to", …), and MUST search what remains using the same rules as a typed query.
- **FR-019**: A voice search MUST move the owner to the search results shelf from the entry screen, the category shelf, or a file shelf.
- **FR-020**: If speech input is missing, refused or fails, the system MUST say so with the reason and MUST leave typing fully usable.

**Export and import**

- **FR-021**: In the desktop app, dragging the pulled-out file cover or the inspector preview out of the window MUST hand the real file to the receiving app.
- **FR-022**: An export tray MUST hold a list of files without duplicates, show each as a card with name, format and size, slide up when a file is added or a drag starts, and offer Export, Copy paths, Reveal all in Finder, and Clear.
- **FR-023**: Export MUST copy every tray file into one newly created folder, MUST NOT modify, move or overwrite any existing file, and MUST then show that folder. If any copy fails the owner MUST be told which.
- **FR-024**: Files dropped onto the window from Finder MUST be shown on a file shelf with their details; a single dropped folder MUST open as a folder shelf.
- **FR-025**: Every path the tray or a drop passes to the operating system MUST first be checked to be a full path that exists.
- **FR-026**: In the browser preview, tray actions that need real files MUST tell the owner they need the desktop app.

**Inspector**

- **FR-027**: The inspector MUST show a badge naming the format and the kind of match, a details line with size, created, modified and permissions, the path with the home folder shortened to `~`, and an "Add to export tray" action.

**Carried over**

- **FR-028**: Search, sort, native actions, validation and error reporting MUST keep behaving as specified in spec 001. The three review fixes left failing on `001-archiveos` (word-boundary cluster matching, medical reports out of Projects, non-Latin query words) MUST pass before this feature merges.

### Key Entities

- **File record** (from spec 001), with two additions: **kind** (file or folder) and **permissions** (read/write/execute for owner, group, others).
- **Category**: as in spec 001; FOLDERS is a new kind whose contents come from locations, not from extensions or keywords.
- **Location trail**: the ordered list of folders from the FOLDERS starting list down to the folder on the shelf; drives the path bar.
- **Voice command**: the phrase heard, the wake phrase found (if any), and the query left after removing wake phrase and filler.
- **Export tray**: an ordered set of file records, unique by full path, kept for the current session only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across every screen, 0 interface labels contain Chinese or Japanese characters, and the wordmark reads ARKHIVE.
- **SC-002**: From launch, the owner reaches the category shelf in one action (button, Enter, or tap), and reaches search results from the entry screen in two (type, submit).
- **SC-003**: The owner can go from the category shelf to a file three folders deep in 5 actions or fewer, and back to any level above in 1.
- **SC-004**: The spoken phrase "Hey Arkhive, find the file which has blood related" produces the same results as typing "blood related", 100% of the time on the demo set.
- **SC-005**: A file dragged from the shelf arrives intact in Finder (same name and size as the original).
- **SC-006**: Exporting 10 files from the tray produces 10 copies in one new folder with 0 originals changed.
- **SC-007**: Every voice, drag, tray and folder action either succeeds or shows a reason; 0 silent failures.
- **SC-008**: The entry screen and shelf stay smooth (no visible stutter) on a recent Mac and a recent iPhone.

## Assumptions

- Decided by the owner on 2026-11-11: the operating system's file index stays the search source; the app builds no index of its own. This version targets Mac and iPhone; Android comes later.
- Read from that same answer, and open to correction: the Full Disk Access check, a real-folder picker for the browser preview, and a native speech fallback are also left for a later version.
- Desktop, Documents and Downloads need only the folder permissions macOS asks for by itself.
- On iPhone the app still reaches only its own Documents folder (spec 001). FOLDERS on iPhone starts there. Dragging files out to other apps is Mac-only.
- "Replaces Finder" means browse, search, open, reveal and hand off. Renaming, moving and deleting files are out of scope.
- Listening happens only while the owner has the mic on, with a visible indicator. Speech is turned into text by the device's built-in speech service, which may process audio off the device; the app itself stores and sends nothing.
- The existing shelf scrolls by dragging, so only the pulled-out cover and the inspector preview start a file drag. Spines keep scrolling the shelf. This differs from the brief, which makes every spine draggable. A file drag is a mouse gesture; on touch screens files are staged with the "Add to export tray" control.
- FOLDERS starts at Desktop, Documents and Downloads. Other folders are reached by dropping them onto the window. A folder picker is out of scope.
- Export goes to a new folder inside Downloads ("Arkhive Export", then "Arkhive Export 2", …). Choosing another destination is out of scope.
- Voice is built on the speech input that browsers provide. Public reports say this does not work inside app windows on Apple platforms, so voice in the Mac and iPhone apps is confirmed by hand; if it fails there, a native speech piece is the follow-up.
- The tray is not kept between launches.
- Depth on the phone entry screen follows touch position; device tilt is not used.
- The interface stays two files (page and logic script) as justified in plan 001, not one file as the brief says, so the logic stays testable. Backend command names from spec 001 are kept.
