# Feature Specification: ArchiveOS — tactile shelf file search

**Feature Branch**: `001-archiveos`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "ArchiveOS: a tactile 3D file manager and content search app for macOS (plus iOS limited to user-picked folders). Landing meadow scene → Tier 1 3D category shelf → Tier 2 3D shelf of actual files (from a category or a search) → file inspector with ink-blot reveal. Search finds files by name or text inside them (e.g. "blood related" finds a lab report PDF named Scan_Nov_10.pdf) using the OS file index plus a small synonym list. Sort by relevance/name/date/size, filter by format. Native actions: open, reveal in Finder, Quick Look. Browser preview uses a built-in demo dataset of 36+ files so every flow works without the backend."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find a file by what is inside it (Priority: P1)

The owner types a plain phrase such as "blood related" and gets the files whose name **or contents** relate to it — a lab report PDF named `Scan_Nov_10.pdf`, a photographed receipt, a slide deck — laid out on a shelf, best match first, each showing the snippet that matched.

**Why this priority**: This is the reason the app exists. Finder search by filename cannot find `Scan_Nov_10.pdf` from the word "blood".

**Independent Test**: With the demo dataset, type "blood related", submit, and check that every blood-related demo file appears, files whose only match is in their contents are included, and each result shows a match snippet.

**Acceptance Scenarios**:

1. **Given** the shelf is open, **When** the user types "blood" and submits, **Then** the results include files matching "blood" in the name or contents, ranked with name matches and dense content matches first.
2. **Given** a file named `Scan_Nov_10.pdf` whose contents mention "hemoglobin", **When** the user searches "blood related", **Then** that file is in the results, because "blood" expands to related terms (hemoglobin, CBC, hematology, plasma, platelet, serum, lipid…).
3. **Given** a query with filler words ("find the file which has blood related"), **When** submitted, **Then** filler words are ignored and results equal those for "blood".
4. **Given** a query that matches nothing, **When** submitted, **Then** the user sees an explicit "no files match" state, not an empty or broken shelf.

---

### User Story 2 - Browse files by format on a 3D shelf (Priority: P1)

The owner scrolls an endless shelf of category boxes (PDF, PPT, JPEG, DOCX, XLSX, CODE, MEDIA, ZIP, plus Medical, Finance/Legal, Projects, Recent). Opening a category opens a second shelf whose boxes are the actual files in that category.

**Why this priority**: Browsing is the second way into files and frames the whole experience.

**Independent Test**: Open the PDF category; every file on the second shelf is a PDF; going back returns to the category shelf with PDF still selected.

**Acceptance Scenarios**:

1. **Given** the category shelf, **When** the user scrolls, drags, swipes, or uses arrow keys, **Then** the shelf glides and the selected box pulls out and turns to show its cover.
2. **Given** a selected category, **When** the user opens it, **Then** a sheet expands from that box into a shelf containing only files of that category.
3. **Given** the file shelf, **When** the user picks "All categories", **Then** the sheet collapses back onto the category box it came from.
4. **Given** the category filter tabs (All, Docs, Media, Code & Data, Smart Clusters), **When** one is chosen, **Then** only matching categories stay on the shelf.

---

### User Story 3 - Sort and narrow a file shelf (Priority: P2)

On any file shelf (category or search), the owner re-orders by Relevance, Name A–Z, Date newest, Date oldest, or Size largest, and narrows by format (All, PDF, PPT, JPEG, DOCX).

**Why this priority**: Makes large result sets usable; secondary to finding and browsing.

**Independent Test**: On the search results for "blood", choose Name A–Z and check that the shelf order is alphabetical; choose PDF and check that only PDFs remain.

**Acceptance Scenarios**:

1. **Given** a file shelf, **When** a sort tab is chosen, **Then** files re-order accordingly and the shelf glides back to the first file.
2. **Given** a file shelf, **When** a format pill is chosen, **Then** only files of that format remain; if none remain the empty state shows.

---

### User Story 4 - Inspect and act on a file (Priority: P2)

Opening a file shows a full-screen inspector with name, format, size, created/modified dates, location, the matched text with query terms highlighted, a preview, and actions: open in default app, Quick Look, reveal in Finder.

**Why this priority**: Finding a file only matters if you can then use it.

**Independent Test**: Open `CBC_Blood_Panel_Report_Nov2026.pdf` from search results; the inspector shows its metadata and a snippet with "blood" highlighted; Close returns to the same shelf position.

**Acceptance Scenarios**:

1. **Given** the selected file on a shelf, **When** the user opens it (click or Enter), **Then** the inspector expands from that file's cover and shows its details.
2. **Given** the inspector in the app (not browser preview), **When** the user chooses Open / Quick Look / Reveal, **Then** the operating system performs that action on the real file.
3. **Given** the inspector in browser preview, **When** the user chooses a native action, **Then** the user is told the action needs the desktop app — nothing fails silently.
4. **Given** the inspector, **When** the user presses Escape or Close, **Then** it collapses back onto the file's cover.

---

### User Story 5 - Arrive through the landing scene (Priority: P3)

On launch the owner sees an illustrated meadow workspace with an open laptop and an archive binder, index status pills, a headline, and two buttons: Enter File Vault and Voice / Semantic Search. Entering dives into the category shelf.

**Why this priority**: Sets the tone; not needed to find files.

**Independent Test**: Load the app, press Enter, and check that the category shelf appears via the expanding sheet.

**Acceptance Scenarios**:

1. **Given** the landing scene, **When** the user clicks Enter File Vault, the laptop/binder, or presses Enter, **Then** a sheet grows from the binder/laptop to full screen and the category shelf rises into place.
2. **Given** the landing scene, **When** the user clicks Voice / Semantic Search, **Then** they land on the shelf with the search field focused (voice input used if the platform supports it).
3. **Given** the category shelf, **When** the user picks "Back to meadow", **Then** the landing scene returns.

---

### Edge Cases

- Empty query or query of only filler words → nothing is submitted; the field stays open.
- Category with zero files → explicit empty state, not a blank shelf.
- Fewer files than shelf slots → files repeat so the shelf still loops endlessly.
- The OS file index is unavailable or returns an error → the user sees the error message; the app does not pretend there are zero matches.
- A path with spaces, quotes, or non-ASCII characters → native actions still target the correct file.
- Query text with characters that are special to the OS index query language → treated as literal text, never as query syntax.
- On iOS, no folder picked yet → the app asks the user to pick a folder before searching.
- Reduced-motion preference → transitions still complete (shortened), never stuck mid-animation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST search file names and file contents for a free-text query and return matching files ranked by relevance.
- **FR-002**: The system MUST expand query terms with a built-in list of related terms (at minimum: blood → hemoglobin, hematology, CBC, plasma, platelet, serum, transfusion, glucose, lipid, lab report).
- **FR-003**: The system MUST drop common filler words ("find", "the", "file", "which", "has", "related", …) from queries before searching.
- **FR-004**: Each result MUST carry name, format/category, size, created and modified dates, full path, and (when contents matched) a text snippet around the match.
- **FR-005**: The system MUST group files into the 12 categories listed in User Story 2, by extension for format categories and by content keywords for Medical, Finance/Legal, and Projects; Recent = modified in the last 7 days.
- **FR-006**: File shelves MUST support sort by relevance, name A–Z, date newest, date oldest, size largest, and filtering by format.
- **FR-007**: The desktop app MUST open a file in its default app, show it in Quick Look, and reveal it in Finder.
- **FR-008**: All user-supplied text (queries, paths) MUST be validated before it reaches the OS: queries are length-limited and escaped; native actions only accept paths that exist on disk.
- **FR-009**: When running outside the desktop app, the UI MUST use a built-in demo set of at least 36 files across PDF, PPT, JPEG, DOCX, XLSX, and CODE, including at least 5 blood-related files whose blood-relatedness is only in contents for at least 2 of them.
- **FR-010**: All motion MUST use geometry (transforms, clip-path, masks), never opacity fades, in the Soft Beige / Mocha / Forest Green / Dull Gold palette defined in the brief.
- **FR-011**: The shelf MUST be operable by mouse, touch, and keyboard (arrows, Enter, Escape, `/` or ⌘K for search).
- **FR-012**: On iOS, search MUST be limited to folders the user has picked, matching file names and the contents of plain-text files.
- **FR-013**: Errors from search or native actions MUST be shown to the user with the reason.

### Key Entities

- **File record**: name, extension, category, full path, size, created date, modified date, match snippet (optional), relevance score.
- **Category**: key, label, description, the set of extensions or content keywords that place a file in it.
- **Query**: raw text, cleaned terms, expanded terms.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Searching "blood related" on the demo set returns all 5+ blood-related demo files and no unrelated files, within 1 second.
- **SC-002**: A file whose only link to the query is its contents (e.g. `Scan_Nov_10.pdf`) is found by content search 100% of the time on the demo set.
- **SC-003**: From launch, the owner can reach a specific file's inspector by search in 3 actions or fewer (enter, type + submit, open).
- **SC-004**: The shelf animates at a steady frame rate (no visible stutter) with 36 files × 3 copies on a recent Mac.
- **SC-005**: Every native action either succeeds or shows an error; 0 silent failures.

## Assumptions

- Single user (the owner) on their own Mac; no accounts, sync, or sharing.
- On macOS, the operating system's existing file content index (including text in images on Apple Silicon) is the search source; no separate index is built.
- iOS has no system-wide index available to apps, so iOS search covers only picked folders and only plain-text contents in this version; PDF/image contents on iOS are out of scope.
- "Voice search" uses the platform's built-in speech input when available; otherwise the button just focuses the text field.
- Semantic understanding is limited to the built-in related-terms list; no machine-learning model ships in this version.
- Android, drag-out, and "share to iPhone" actions are out of scope for this version.
- The landing meadow is drawn in code (no image assets) to stay a single self-contained page.
