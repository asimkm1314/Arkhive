# Research: Arkhive

Builds on `specs/001-archiveos/research.md` (R1–R7 stay in force unless changed here).

## R8. Search source (re-confirmed)

- **Decision**: Keep Spotlight. No SQLite index, extractors, OCR helper or file watcher.
- **Rationale**: The owner chose this again on 2026-11-11. Spotlight already covers names, dates, text in PDF/Office/code and text in images.
- **Alternatives**: The brief's SQLite FTS5 design (`rusqlite`, `walkdir`, `notify`, `pdf-extract`, `zip`, `quick-xml`, `chrono`, a Swift Vision helper). Rejected: eight dependencies and a database to keep in sync, to duplicate the system index.

## R9. Voice input in the app's webview

- **Finding**: WebKit exposes `webkitSpeechRecognition` inside app webviews but, by WebKit's own bug report, it does not work there: no permission prompt appears and recognition never starts ([WebKit bug 239816](https://bugs.webkit.org/show_bug.cgi?id=239816)). It works in Safari and Chrome.
- **Decision**: Build voice on the Web Speech API with feature detection and full error reporting. Add `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` to the macOS and iOS plists, because macOS terminates an app that touches the microphone without them.
- **Consequence**: Voice is automatically tested in the browser preview with a simulated recogniser. In the desktop and iPhone apps it may report "unavailable"; that is checked by hand (quickstart step V1). If it fails there, voice on Mac needs the native speech piece the owner deferred (task T905).
- **Alternatives**: A native `SFSpeechRecognizer` command now. Rejected for this version: deferred by the owner, and unneeded if the hand check passes.

## R10. Native drag-out

- **Decision**: The `drag` crate (2.1.1, by CrabNebula) called from our own `start_native_drag` command, which validates the path first. Preview image: the app icon, embedded at compile time.
- **Rationale**: `NSDraggingSession` through raw Objective-C would be far more code. `tauri-plugin-drag` wraps the same crate but exposes a command that takes any path from the page without our check (constitution IV), so we call the crate directly.
- **How it starts**: a mouse press on the pulled-out cover or the inspector preview that moves 6px becomes a file drag (see R18). In the app the page invokes the command and the system takes the drag over; everywhere, releasing over the tray stages the file.

## R11. Dropping files in

- **Decision**: Listen for Tauri's `tauri://drag-drop` event (`payload.paths`, `payload.position` in physical pixels). A drop over the tray adds to the tray; a single folder dropped elsewhere opens as a folder shelf; anything else opens a "Dropped" file shelf. Paths are turned into records by `stat_paths`.
- **Unverified**: whether a drag that started on our own shelf and ends on our own tray raises this event. If it does not, the "Add to export tray" button is the way in. Hand check D2.

## R12. Folder listing

- **Decision**: `list_dir(path?)` with `std::fs::read_dir`. No path → the three roots (Desktop, Documents, Downloads; on iPhone the contents of the app's Documents folder). Hidden names skipped, folders first then name, 300 entries, plus the full count so the page can say the list was cut.
- **Rationale**: Standard library only. Spotlight is the wrong tool for "what is in this one folder".

## R13. File count on the welcome window

- **Decision**: `mdfind -count` limited to Desktop, Documents and Downloads. Measured 0.19 s on the owner's Mac. Counting all of the home folder took 15 s and included Library files, so it is not used. The label names the three folders.

## R14. Export

- **Decision**: `export_files(paths)` copies with `std::fs::copy` into a new folder `~/Downloads/Arkhive Export`, or `Arkhive Export 2`, `3`, … (the first name `create_dir` accepts). Clashing file names get ` 2`, ` 3` before the extension. Then `open` shows the folder. Files only.
- **Rationale**: `create_dir` fails if the folder exists, so nothing is ever overwritten, and no date library is needed.
- **Alternatives**: a save dialog (`tauri-plugin-dialog`, a new dependency) or a zip bundle (`zip`, a new dependency).

## R15. Word-start name matching (review fix from 001)

- **Finding**: Spotlight's `w` modifier matches at word starts inside file names: `kMDItemFSName == "spec*"cdw` finds `ui.spec.js` and `task_special_ports.h`; `"chive*"cdw` finds nothing in a tree full of `archiveos` files.
- **Decision**: Name matches start at a word in both places that implement the rule: `scoreFile` in `core.js` and the name clause in `build_query` (`"*t*"cd` → `"t*"cdw`). The Projects keyword `repo` becomes `repository`, since `repo` is a prefix of `report`.

## R16. Non-Latin query words (review fix from 001)

- **Decision**: Tokens keep combining marks (`\p{M}`), and a one-character token is kept when it is Han, Hiragana, Katakana or Hangul. The backend's term check allows any non-ASCII character that is not whitespace or a control character, and still rejects every ASCII character that is not a letter or digit, so a term cannot close the quoted value in the Spotlight query.

## R17. Rename depth

- **Decision**: Rename what the owner sees: wordmark, page title, window title, `productName` (the Mac app becomes `Arkhive.app`), and the iPhone display name. Keep the crate name `archiveos` and the identifier `dev.archiveos.app`.
- **Rationale**: Changing the identifier or crate name forces a regenerated Xcode project (dozens of generated files) and resets macOS permissions, for no visible gain.

## R18. The pulled-out cover is not hit-tested by Chrome

- **Finding**: `document.elementsFromPoint` at the centre of the pulled-out cover returns the shelf, not the cover, in Chrome. Spines hit-test normally. The cover's parent is rotated 90°, so its plane is edge-on to the viewer. This was already true in 001: clicking the cover did nothing there, and only Enter or the round button opened it. Not checked in the app's own webview (WebKit).
- **Decision**: Find the cover by its on-screen rectangle (`getBoundingClientRect`, which is correct) for click, hover, tilt, cursor state and drag. Because the browser will not start an HTML drag on an element it cannot hit, file drags are detected from pointer movement instead of the `draggable` attribute.
- **Alternatives**: Restructure the 3D tree so the cover's parent is never edge-on. Rejected: it changes the shelf engine's transforms for every box to fix one hit test.
