# Arkhive

A tactile 3D file shelf for macOS (and iPhone, limited to the app's Documents folder). Type or say a phrase like "blood related" and get back the lab report PDF named `Scan_Nov_10.pdf`, because the search looks inside files, not only at their names.

Everything on screen is your own files. The app ships no sample data.

- **Start**: a black stage with a tilted ring of six cards, one per vault. Scroll to move through the four stages; the ring turns with the scroll and the cards smear into a spectrum at speed. Click a card, choose Archive, or scroll past the last stage to open the vault.
- **Vault shelf**: 12 vaults (PDF, PPTX, JPEG, DOCX, XLSX, Code, Folders, Medical / Health, Media, Archives, Projects, Recent), each with its real file count and total size.
- **File shelf**: the files in a vault, a search, or a folder. The pulled-out cover shows a real preview of the file. Two pills, `SORT` and `FILES`, widen in place to show their options.
- **Search**: click the ARKHIVE wordmark (or press `/` or `⌘K`) and the hairline under it opens into a search field.
- **Open**: click the pulled-out cover. A file opens in its default app and shows its inspector; a folder opens on the shelf.
- **Inspector**: details and permissions, the matched text highlighted, the folder path (each folder opens on the shelf), and Open / Quick Look / Reveal in Finder / Rename / Add to export tray / Move to Trash.
- **Export tray**: stage files, then export copies to a new folder in Downloads, copy their paths, or reveal them. The pulled-out cover also drags straight into Finder, Mail or any other Mac app.
- **Voice**: turn the mic on with `V` or the mic button, then say "Hey Arkhive, find the file which has blood related".

Keys: `←` `→` browse, `Enter` open or inspect, `/` or `⌘K` search, `V` mic, `Esc` back, `Space` Quick Look. On the start screen the arrow keys step the story.

## Run it

| What | How |
|---|---|
| Desktop app on your real files | `npm install`, then `npm run tauri dev` |
| Browser preview | `python3 -m http.server 8765`, open `http://127.0.0.1:8765/app/index.html`, then **Choose folder** |
| macOS app bundle | `npm run tauri build -- --bundles app` |
| iPhone simulator build | `npm run tauri ios build -- --debug --target aarch64-sim` (needs Xcode + CocoaPods) |

The browser preview reads the folder you choose (Chrome or Edge): names, sizes, dates, images, and the text of text files. It cannot read text inside PDFs or images, and it cannot open, rename or trash files; those need the desktop app.

## Tests

```sh
npm test                                   # logic: queries, voice phrases, ranking, folders, story, tray
npm run test:ui                            # Playwright on the page: a stand-in folder, and a stand-in backend
cd src-tauri && cargo test                 # backend: validation, Spotlight queries, listing, export, rename, a real Quick Look preview
cd src-tauri && cargo test -- --ignored    # live checks: real Spotlight, and one temp file moved to the real Trash
```

Checks that need a live Mac session are listed in `specs/003-arkhive-prism/quickstart.md`.

## How it works

- **Search (macOS)**: Spotlight (`mdfind`) already indexes the text inside PDFs, Office files and code, and the text in images on Apple Silicon. Arkhive runs one Spotlight query per search word, ranks files by how many words hit (name hits count triple), and pulls snippets from Spotlight's own extracted text. There is no separate database.
- **"Semantic" search** is a small related-words table in `app/core.js` (blood → hemoglobin, CBC, plasma, platelet, serum, donor…). Add a row when a query misses.
- **Counts and sizes**: one `vault_summary` call runs every vault's query and returns its count, total bytes and newest file.
- **Previews**: `thumbnail` asks macOS Quick Look for a PNG, so any file type the Mac can preview gets a real cover.
- **Rename** never replaces another file. **Move to Trash** goes through Finder, so the file can be put back; macOS asks once for permission.
- **Start screen**: `app/hero.js` draws the ring with three 0.160.0 (vendored in `app/vendor/`; run `npm run vendor` after changing the pinned version). Each card is sampled 16 times along its direction of travel and tinted from amber to blue. Without WebGL the cards are shown flat.
- **iPhone** can't search other apps' files. Arkhive searches its own Documents folder, which you fill with the Files app.

## Layout

```text
app/index.html       markup, styles, shelf engine, pills, search, inspector, tray, voice
app/hero.js          the start screen: WebGL ring, shader, scroll story, flat fallback
app/core.js          pure logic, no file data (tested with node:test)
app/vendor/          three.module.min.js, copied from node_modules
src-tauri/src/lib.rs commands: search_files, vault_summary, list_dir, stat_paths, thumbnail, open_file, quick_look,
                     reveal_file, rename_file, trash_file, export_files, start_native_drag (+ unit tests)
specs/               001-archiveos, 002-arkhive, 003-arkhive-prism: spec, plan, research, contracts, tasks
tests/               core.test.js (node), ui.spec.js (Playwright), fixtures/ (stand-in folder for tests only)
```

## Known limits

- **Not yet confirmed on a live Mac**: real Spotlight counts on the shelf, real previews on covers, moving a file to the Trash through Finder (the automated run stopped at the macOS permission prompt), drag into Finder, drop from Finder, and the start screen's frame rate on hardware. See `specs/003-arkhive-prism/quickstart.md`.
- **Voice in the desktop and iPhone apps is unconfirmed.** It uses the browser speech API, which WebKit reports as not working inside app windows. If the mic says voice is unavailable, the fix is a native speech piece (T905).
- Only the top 6 content matches get snippets (T902). A shelf shows at most 300 files and says so when a vault holds more.
- No "move to folder" picker (drag the file out instead), no undo for rename, no batch rename or Trash (T931, T932).
- The tray holds files, not folders; a single card can't be removed (T909).
- No Android build, no Full Disk Access check, no own search index (owner decisions; T906, T907).
- The app's internal identifier is still `dev.archiveos.app`; only the visible name changed.
- Fonts load from Google Fonts. Offline, the page falls back to Georgia and the system sans-serif.
