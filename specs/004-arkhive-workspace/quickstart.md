# Quickstart: Arkhive workspace start, Sort / File types, follow-ups

## Run

```sh
npm install
npm run tauri dev          # desktop app on your real files (also builds the speech helper with swiftc)
npm test && npm run test:ui && (cd src-tauri && cargo test)
npm run tauri ios build -- --debug --target aarch64-sim   # iPhone simulator
```

## Hand checks (need a live Mac or device; task T930/T934)

| ID | Check | Expected |
|---|---|---|
| W1 | Start screen on hardware | Clouds drift smoothly; ENTER ARKHIVE, the laptop and the notebook each grow the vault out of the laptop screen. |
| A1 | DETAILS → ACCESS in the desktop app | Says which of Desktop, Documents, Downloads macOS blocks and whether Full Disk Access is on; OPEN PRIVACY SETTINGS opens Privacy & Security → Full Disk Access. |
| S1 | Press `V` in the desktop app, say "Hey Arkhive, find the file which has blood related" | macOS asks once for microphone and speech recognition; the phrase appears in the voice pill and the search runs. Refusing either is reported by name. |
| M1 | Inspector → MOVE TO FOLDER, pick a folder on another disk | The file moves (copied, then the original removed); a same-named file there is kept and the moved one becomes "name 2.ext". |
| E1 | Tray → EXPORT TO…, pick a folder | A new "Arkhive Export" folder appears inside it with the copies. |
| I1 | iPhone (device or simulator): ADD FOLDER, pick a folder in Files, relaunch | The folder is still listed under FOLDERS and its files are searched. |
| F1 | Change a file in Finder, switch back to Arkhive | Vault counts update within a few seconds. |

## Verified in this change (2026-11-14)

- iPhone simulator build succeeds, launches, and draws the start screen; `arkhive_pick_folder` and `arkhive_saved_folders` are linked into the app binary.
- Known issue found: on the iPhone simulator a white band shows below the page (about 107 pt at the bottom). The page's own background and the window's `backgroundColor` do not reach it, so the webview frame itself is shorter than the screen. Follow-up T933.
