# Contract: backend commands changed by 003

Unchanged from 001/002: `search_files`, `open_file`, `reveal_file`, `quick_look`, `stat_paths`, `export_files`, `start_native_drag`. `list_dir(null)` now returns Desktop, Documents, Downloads and Pictures. `count_files` is removed.

All commands reject with a human-readable string.

## `vault_summary`

Args: `{ queries: { terms: string[], exts: string[], days: number | null }[] }` — 1 to 20 queries, each validated like `search_files`.

Returns: one `{ count: number, bytes: number, newest: FileHit | null }` per query, in order. Files only; the same paths are skipped as in `search_files`. No cap on `count`.

Errors: the `search_files` validation errors, `"too many queries"`, `"spotlight failed: …"`.

## `thumbnail` (Mac only)

Args: `{ path: string, size: number }` — path absolute and existing; size 64 to 1024.

Returns: PNG bytes (an `ArrayBuffer` in the page).

Errors: `"not an absolute path"`, `"file not found: …"`, `"invalid thumbnail size"`, `"no preview for this file"`, `"preview failed: …"`. On iPhone: `"not available on iOS yet"`.

## `rename_file` (Mac only)

Args: `{ path: string, newName: string }` — path absolute, existing, a file. `newName` is a bare file name.

Effect: renames the file within its folder. Never replaces another file.

Returns: the `FileHit` for the renamed file.

Errors: `"not a file: …"`, `"a name is required"`, `"the name is too long"`, `"a name cannot contain / or :"`, `"a name cannot start with a dot"`, `"a name cannot contain control characters"`, `"a file named … already exists here"`, `"rename failed: …"`. On iPhone: `"not available on iOS yet"`.

## `trash_file` (Mac only)

Args: `{ path: string }` — absolute, existing, a file.

Effect: asks Finder to move the file to the Trash (recoverable with Put Back). macOS may ask once for permission to control Finder.

Returns: `null`

Errors: `"not a file: …"`, `"could not move to the Trash: <Finder's reason>"`. On iPhone: `"not available on iOS yet"`.
