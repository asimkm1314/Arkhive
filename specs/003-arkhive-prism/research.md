# Research: Arkhive prism

Builds on the research in 001 and 002.

## R20. Loading three

- **Finding**: three 0.160.0's classic-script build logs a deprecation warning and is removed in later releases. The ES module build has no warning. Chrome refuses to import a module from `file://`, but allows one from a CDN that sends CORS headers; the app's own origin (`tauri://`) and `http://` can import local modules.
- **Decision**: `hero.js` calls `import('./vendor/three.module.min.js')`. When the page is opened from `file://` it imports the same pinned version from jsDelivr instead. Any failure selects the flat hero. `npm run vendor` recopies the file from `node_modules`.

## R21. Ring geometry and the dispersion shader

- **Decision**: Six planes on a circle of radius 2.4 in the ring's own plane; the ring is tilted 18° on X and −12° on Y and turns about its Z axis, as the brief says. Cards counter-rotate so they stay upright and readable all the way round.
- **Shader**: each plane is 2.6 times the card, so there is room for the smear. For 16 values of `t` from 0 to 1 the fragment samples the card at `uv − shift × (t − 0.5)` and weights the sample by a five-stop ramp (#FF7A00, #FFB800, green-yellow, #00E5FF, #1E50FF). Dividing by the summed weights makes a still card come out exactly as painted. `shift` is the card's tangent direction (from its angle on the ring) times the ring's speed, so the warm end trails and the cool end leads. A small constant shift gives the idle fringe. Hover scales the shift to a tenth. At speed the plane's alpha falls off radially.
- **Colour**: textures and output stay in display space (no conversion either way), so the paper colours match the vault.

## R22. Story scroll without a scroll library

- **Decision**: Wheel, vertical touch drag, arrow keys and the two nav controls move a target between 0 and 1; the shown position eases toward it (`1 − e^(−6·dt)`), which is what a smooth-scroll library does. Position × 4 gives the stage. Passing 1.1 opens the vault.

## R23. Real previews

- **Finding**: `qlmanage -t -s <size> -o <dir> <file>` writes `<name>.png` for any type Quick Look can preview (measured: PNG and plain text both produced a 256px PNG). Tauri commands can return raw bytes with `tauri::ipc::Response`.
- **Decision**: `thumbnail(path, size)` runs it into a private temp folder, returns the PNG bytes and removes the folder. The page turns the bytes into a `blob:` URL, caches up to 240, and asks only for the pulled-out cover, the inspector, and the six hero cards.
- **Alternatives**: the asset protocol with scope `**` (lets any page content read any file); a PDF renderer in the page (a large dependency, PDFs only).

## R24. Vault summaries

- **Decision**: `vault_summary(queries)` runs each vault's Spotlight query, drops the same paths the shelf drops, stats what is left and returns count, total bytes and the newest file. The old approach (a full search per vault, with snippets, capped at 300) is removed, along with `count_files`.

## R25. Rename and Trash

- **Rename**: `std::fs::rename` inside the same folder after validating the name and checking the target does not exist (a case-only change is allowed). Shortcut noted in code: the existence check and the rename are two steps; an exclusive rename call would close that gap if another process ever races us.
- **Trash**: `~/.Trash` is protected by macOS, so a plain move fails without Full Disk Access. `osascript` asks Finder to delete the item, which is the supported route and gives Put Back. The path is `item 1 of argv`.
- **Alternatives**: the `trash` crate (a dependency for one `osascript` call).
