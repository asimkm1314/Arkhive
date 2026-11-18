# Quickstart: validating Arkhive

## Automated

```sh
npm test                      # logic
npm run test:ui               # UI flows on the demo page (needs Google Chrome)
cd src-tauri && cargo test    # backend
```

All three must pass.

## By hand, in the desktop app (`npm run tauri dev`)

These need a live Mac session and are not automated (task T904).

| # | Do | Expect |
|---|---|---|
| E1 | Launch | Laptop lid opens; the welcome window shows a real file count for Desktop, Documents and Downloads |
| F1 | Open FOLDERS → Documents → any subfolder; click `Documents` in the path bar | Each step lists that folder; the path bar jumps back |
| V1 | Press `V`, allow the microphone, say "Hey Arkhive, find the file which has blood related" | Pill shows the words; results shelf opens. **If instead a message says voice is unavailable, record the reason: that triggers T905.** |
| D1 | Open any file shelf, drag the pulled-out cover onto the Mac desktop | A copy of the real file appears on the desktop |
| D2 | Drag the pulled-out cover onto the tray | A card appears in the tray |
| D3 | Drag two files from Finder onto the window; then drag one folder | A "Dropped" shelf with both files; then that folder's contents |
| X1 | Add two files to the tray, choose Export | Finder shows `~/Downloads/Arkhive Export` holding both copies; originals unchanged |
| X2 | Choose Copy paths, paste in a text editor | One full path per line |
| I1 | Open a file's inspector | Permissions shown like `rw-r--r--`; path starts with `~` |

## iPhone simulator

```sh
npm run tauri ios build -- --debug --target aarch64-sim
```

Expect: the phone entry scene, the tap bar opens the shelf, FOLDERS lists the app's Documents folder. Export and drag-out report "not available on iOS yet".
