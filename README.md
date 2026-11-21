# Arkhive

A tactile 3D file shelf for macOS (and iPhone, limited to the app's Documents folder). Type or say a phrase like "blood related" and get back the lab report PDF named `Scan_Nov_10.pdf`, because the search looks inside files, not only at their names.

Everything on screen is your own files. The app ships no sample data.

- **Home**: on open ARKHIVE travels through two layers of gold and cream curves to the centre; ENTER ARKHIVE rises at the bottom centre and lifts under the pointer; the pixel laptop with a leather notebook sits bottom-right. Each of them grows the vault out of itself; ← HOME folds it back in.
- **Viewing**: clicking a file shows it inside Arkhive. PDFs, pictures, video and audio load straight from disk; Word, PowerPoint, Excel and CSV become a page through macOS Quick Look (RTF and DOC through textutil); text and code are read as text. Nothing is handed to Finder unless you press OPEN IN DEFAULT APP.
- **Dark mode**: DARK MODE in the top bar grows the dark theme out of the button to the whole screen (LIGHT MODE switches back); the choice is remembered, light is the default.
- **Folders**: every folder Finder shows in your home folder, plus iCloud Drive and Applications. Apps and the Photos library are single items, as in Finder.
- **Vault shelf**: 16 vaults (All files, PDF, PPTX, JPEG, DOCX, XLSX, Code, Desktop, Documents, Downloads, Folders, Medical / Health, Media, Archives, Projects, Recent), each with its real file count and total size.
- **SORT and FILE TYPES**: two boxed buttons just above the shelf, on every shelf. Press one to unfold its options; a choice applies and folds it. SORT: relevance, name A–Z / Z–A, date newest / oldest, size. FILE TYPES lists each type with its count; on the vault shelf it opens that type.
- **File shelf**: the files in a vault, a search, or a folder. The pulled-out cover shows a real preview of the file.
- **Search**: click the ARKHIVE wordmark (or press `/` or `⌘K`) and the hairline under it opens into a search field.
- **Open**: click the pulled-out cover. A file is shown inside Arkhive (see Viewing); a folder opens on the shelf.
- **Inspector**: details and permissions, the matched text highlighted, the folder path (each folder opens on the shelf), and Open / Quick Look / Reveal in Finder / Rename (with UNDO) / Move to folder / Add to export tray / Move to Trash.
- **Export tray**: stage files, then export copies to Downloads or a folder you pick, copy their paths, reveal them, rename them all ("Lab 1.pdf", "Lab 2.pdf", …), or move them all to the Trash. Each card has its own remove button. The pulled-out cover also drags straight into Finder, Mail or any other Mac app.
- **Voice**: turn the mic on with `V` or the mic button, then say "Hey Arkhive, find the file which has blood related". The Mac app uses macOS speech recognition through a small bundled helper.
- **iPhone**: ADD FOLDER picks any folder in the Files app; Arkhive remembers it and searches it with its own folder.

Keys: `←` `→` browse, `Enter` open or inspect, `/` or `⌘K` search, `V` mic, `Esc` back, `Space` Quick Look. On the start screen the arrow keys step the story.

## Run it

| What | How |
|---|---|
| Desktop app on your real files | `npm install`, then `npm run tauri dev` |
| Browser preview | `python3 -m http.server 8765`, open `http://127.0.0.1:8765/app/index.html`, then **Choose folder** |
| macOS app bundle | `npm run tauri build -- --bundles app` |
| iPhone simulator build | `npm run tauri ios build -- --debug --target aarch64-sim` (needs Xcode + CocoaPods) |

The browser preview reads the folder you choose (Chrome or Edge): names, sizes, dates, images, and the text of text files. It cannot read text inside PDFs or images, and it cannot open, rename or trash files; those need the desktop app.

## Install on another Mac

`npm run tauri build` writes `src-tauri/target/release/bundle/dmg/Arkhive_0.1.0_aarch64.dmg` (Apple Silicon). Send that file.

1. Open the .dmg and drag Arkhive into Applications.
2. Open Arkhive. The build is signed ad hoc, not with an Apple Developer ID, so macOS stops it the first time: open System Settings → Privacy & Security, scroll to "Arkhive was blocked", choose Open Anyway, and confirm.
3. macOS asks once each for Desktop, Documents and Downloads. Allow them; Arkhive then reads every file in the home folder into its own index on that Mac (names first, then the text inside documents and images).
4. A folder refused by mistake: the vault says which one. Allow it under Privacy & Security → Files and Folders, then reopen Arkhive.

Nothing is uploaded; the index lives in `~/Library/Application Support/dev.archiveos.app/`. Removing the double prompt in step 2 needs an Apple Developer ID ($99/year) to sign and notarize the build.

## Tests

```sh
npm test                                   # logic: queries, voice phrases, ranking, folders, story, tray
npm run test:ui                            # Playwright on the page: a stand-in folder, and a stand-in backend
cd src-tauri && cargo test                 # backend: validation, Spotlight queries, listing, export, rename, a real Quick Look preview
cd src-tauri && cargo test -- --ignored    # live checks: real Spotlight, and one temp file moved to the real Trash
```

Checks that need a live Mac session are listed in `specs/003-arkhive-prism/quickstart.md` and `specs/004-arkhive-workspace/quickstart.md`.

## How it works

- **Search (macOS)**: Arkhive's own index, `arkhive_real_index.db` (SQLite FTS5, WAL) in the app's data folder. At launch it indexes Desktop, Documents, Downloads and Pictures (3 levels), then the whole home folder (skipping hidden folders, Library, node_modules, target and app packages such as the Photos library), then reads the text inside PDF, Word, PowerPoint, Excel, text and code files, and OCRs JPEG, PNG and HEIC with Apple's Vision (`src-tauri/ocr/main.swift`). An FSEvents watcher keeps it current. Name hits rank above content hits; every content hit has a snippet. Until the first content pass finishes, content search also asks Spotlight.
- **"Semantic" search** is a small related-words table in `app/core.js` (blood → hemoglobin, CBC, plasma, platelet, serum, donor…). Add a row when a query misses.
- **Counts and sizes**: one `vault_summary` call runs every vault's query and returns its count, total bytes and newest file.
- **Previews**: `thumbnail` asks macOS Quick Look for a PNG, so any file type the Mac can preview gets a real cover.
- **Rename** never replaces another file. **Move to Trash** goes through Finder, so the file can be put back; macOS asks once for permission.
- **Home**: `app/landing.js` draws only the pixel laptop, notebook and pen, in palette colours; the laptop screen moves, nothing moves with reduced motion. Without canvas the words and buttons still work on a flat ground.
- **Live counts**: when the window comes back into focus (at most every 5 s), vault counts, the access check and an open folder shelf refresh.
- **Voice on Mac**: `src-tauri/speech/main.swift` (SFSpeechRecognizer, on-device when available) is compiled by `build.rs` and shipped beside the app (`tauri.macos.conf.json`). It prints one line per event; a 1.4 s pause ends a phrase.
- **iPhone** can't search other apps' files. Arkhive searches its own Documents folder plus folders you add; `gen/apple/Sources/archiveos/FolderPicker.swift` keeps them as security-scoped bookmarks.

## Layout

```text
app/index.html       markup, styles, shelf engine, SORT / FILE TYPES, search, inspector, viewer, tray, voice
app/landing.js       the start screen: pixel-art scene, laptop and notebook, the screen the vault grows from
app/core.js          pure logic, no file data (tested with node:test)
src-tauri/src/lib.rs commands: search_files, vault_summary, list_dir, stat_paths, thumbnail, snippet, open_file, quick_look,
                     reveal_file, rename_file, move_file, choose_folder, trash_file, export_files, start_native_drag,
                     access_status, open_privacy_settings, speech_start, speech_stop, add_folder (+ unit tests)
src-tauri/speech/    the macOS speech helper (Swift), built by build.rs
specs/               001-archiveos, 002-arkhive, 003-arkhive-prism, 004-arkhive-workspace: spec, plan, tasks, …
tests/               core.test.js (node), ui.spec.js (Playwright), fixtures/ (stand-in folder for tests only)
```

## Known limits

- **Not yet confirmed on a live Mac**: real Spotlight counts, real previews, the Trash through Finder, drag into and out of Finder, macOS speech (microphone and speech permission prompts), Move to folder across disks, and the iPhone folder picker on a device. See the two quickstart files.
- **macOS privacy prompts can't be skipped.** No app can read Desktop, Documents or Downloads without the owner's yes; the vault says what is blocked and opens the Full Disk Access setting.
- Scanned PDFs with no text layer are found by name only (the image OCR does not run on PDF pages).
- JPEG and PNG covers load straight from disk through the asset protocol, limited to the home folder.
- A shelf holds up to 20,000 files (it draws only the boxes near the pulled-out one) and says so when a vault holds more.
- Hidden files, ~/Library (except iCloud Drive), and node_modules / target folders stay out of the index and search, as dependency code would bury your documents; open those folders from the shelf to see their contents.
- The tray holds files, not folders.
- **iPhone**: a white band shows below the page on the simulator (the webview frame stops short of the screen bottom, T933).
- **No Android build yet** (T906): deferred for disk space; it needs about 6–8 GB free.
- The app's internal identifier is still `dev.archiveos.app`; only the visible name changed.
- Inter Tight and Newsreader ship inside the app (`app/fonts/`, SIL OFL); nothing is fetched from the internet.
