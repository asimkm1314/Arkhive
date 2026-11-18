# Contract: Tauri commands added by Arkhive

`search_files`, `open_file`, `reveal_file` and `quick_look` keep their contract from `specs/001-archiveos/contracts/commands.md`, with two changes: every `FileHit` carries `kind` and `mode` (see data-model.md), and a name match now starts at a word in the file name.

All commands reject with a human-readable string.

## `list_dir`

Args: `{ path: string | null }`

- `null` → the starting list: Desktop, Documents and Downloads as folder records (on iPhone, the contents of the app's Documents folder).
- string → must be absolute, exist, and be a folder.

Returns: `{ entries: FileHit[], total: number }`. Names starting with `.` are left out. Folders first, then name (case-insensitive). At most 300 entries.

Errors: `"not an absolute path"`, `"file not found: …"`, `"not a folder: …"`, `"cannot read …: <reason>"`.

## `stat_paths`

Args: `{ paths: string[] }` — 1 to 300 absolute, existing paths.

Returns: `FileHit[]`, one per path, in the order given.

Errors: `"nothing dropped"`, `"too many items"`, `"not an absolute path"`, `"file not found: …"`.

## `count_files`

Args: none.

Returns: number of indexed files in Desktop, Documents and Downloads (on iPhone, files in the app's Documents folder).

Errors: `"spotlight failed: …"`.

## `export_files` (Mac only)

Args: `{ paths: string[] }` — 1 to 300 absolute paths of existing files (not folders).

Effect: creates `~/Downloads/Arkhive Export` (or ` 2`, ` 3`, …), copies every file into it, shows the folder in Finder. Never overwrites: a repeated file name gets ` 2`, ` 3` before its extension.

Returns: the new folder's path.

Errors: `"nothing to export"`, `"too many items"`, `"not a file: …"`, `"file not found: …"`, `"export failed at <name>: <reason> (N of M copied to <folder>)"`. On iPhone: `"not available on iOS yet"`.

## `start_native_drag` (Mac only)

Args: `{ path: string }` — absolute, existing.

Effect: starts a system drag carrying that file from the app window.

Errors: `"not an absolute path"`, `"file not found: …"`, `"drag failed: …"`. On iPhone: `"not available on iOS yet"`.

## Event listened to: `tauri://drag-drop`

Payload: `{ paths: string[], position: { x, y } }` (physical pixels). Paths go through `stat_paths` or `list_dir` before use.
