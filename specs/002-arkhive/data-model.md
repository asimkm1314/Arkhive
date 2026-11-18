# Data Model: Arkhive

Changes to `specs/001-archiveos/data-model.md`. Anything not listed is unchanged.

## FileHit (two new fields)

| Field | Type | Rules |
|---|---|---|
| `kind` | `"file"` \| `"dir"` | search results are always `"file"` |
| `mode` | number | Unix permission bits, `0`–`0o777` |

For a folder: `ext` is `""`, `size` is `0`, `snippet` is null.

## Listing (returned by `list_dir`)

`{ entries: FileHit[], total: number }` — `entries` holds at most 300, folders first then by name; `total` is the count before the cut.

## Category (core.js `CATEGORIES`)

12 entries, in shelf order: PDF, PPTX, JPEG, DOCX, XLSX, CODE, FOLDERS, MEDICAL, MEDIA, ZIP, PROJECTS, RECENT.

- `PPT` is renamed `PPTX` (key and label). `ZIP` keeps its key; its label is `ARCHIVES`. `MEDICAL`'s label is `MEDICAL / HEALTH`.
- `FINANCE` is removed.
- `FOLDERS` is new: `{ key: 'FOLDERS', folders: true, group: null }`. Its contents come from `list_dir`, not from `exts` or `keywords`.

## Location trail (index.html state `st.trail`)

`[{ name, path }]`, first entry `{ name: 'FOLDERS', path: null }`. Empty when the shelf is not a folder shelf. Opening a folder pushes; choosing a crumb truncates to it.

## Voice command (core.js `parseVoice`)

`parseVoice(heard) → string | null`

- `null`: the phrase does not start with a wake phrase.
- Otherwise the rest of the phrase with leading filler words removed (`""` when nothing is left).
- Wake phrases, at the start only: optional `hey`/`hi`/`ok`/`okay` + `arkhive`/`archive`/`ark hive`; or `find`, `search`, `search for`, `show me`, `look for`.
- The result goes through `cleanQuery` like typed text.

## Export tray (index.html state `st.tray`)

`FileHit[]`, unique by `path`, files only, session only. `trayAdd(tray, f)` returns the same array when `f` is a folder or already present.

## Display helpers (core.js)

- `formatPerms(mode) → string`: `0o644` → `rw-r--r--`.
- `tilde(path) → string`: `/Users/<name>/…` → `~/…`; other paths unchanged.
- `matchKind(f, terms) → 'content' | 'name' | null`: null when not searching.
- `demoDir(files, dir) → FileHit[]`: the demo set's entries directly inside `dir` (`null` → Desktop, Documents, Downloads).

## View state

`landing → tier1 → tier2 → detail` as before. `body.dataset.mic` is `on` while listening. `body.dataset.tray` holds the tray's file count.
