# Quickstart: validating Arkhive prism

## Automated

```sh
npm test                      # logic
npm run test:ui               # UI: browser path (stub folder) and desktop path (stub backend)
cd src-tauri && cargo test    # backend, incl. real rename on temp files and a real Quick Look thumbnail
```

All three must pass.

## By hand, in the desktop app (`npm run tauri dev`)

These need a live Mac session (task T930).

| # | Do | Expect |
|---|---|---|
| H1 | Launch, scroll slowly, then fast | Ring turns with the scroll; cards smear warm-behind, cool-ahead at speed and are sharp at rest; motion is smooth |
| H2 | Keep scrolling past "Now" | The nearest card grows into the vault |
| C1 | Look at the vault spines | "Counting", then real counts and sizes. Compare PDF with Finder's count for `kind:pdf` in your home folder |
| P1 | Pull out a PDF, an image and a Word file | Each cover shows the real first page or picture |
| O1 | Click a pulled-out PDF | Preview opens it and the inspector shows it |
| R1 | Rename a test file; try a name that already exists | First succeeds and shows in Finder; second is refused with the reason |
| T1 | Move a test file to the Trash (two presses) | macOS may ask to let Arkhive control Finder. The file is in the Trash with Put Back; it has left the shelf |
| T2 | `cd src-tauri && cargo test -- --ignored live_trash` | Passes (moves one temp file to the Trash) |
| F1 | Open FOLDERS | Desktop, Documents, Downloads, Pictures |
| V1, D1–D3, X1 | As in `specs/002-arkhive/quickstart.md` | Voice, drag-out, drop-in, export |
