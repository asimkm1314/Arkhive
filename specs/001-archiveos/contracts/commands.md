# Contract: Tauri commands (frontend ⇄ Rust)

Called with `window.__TAURI__.core.invoke(name, args)`. Errors reject with a human-readable string.

## `search_files`

Args: `{ terms: string[], exts: string[], days: number | null }`

- `terms`: 0–16 items, each 1–40 chars of letters/digits only. Empty → browse mode (no text match).
- `exts`: 0–20 items, each 1–10 lowercase alphanumerics.
- `days`: 1–3650 or null.
- At least one of `terms`, `exts`, `days` must be set.

Returns: `FileHit[]` (see data-model.md), max 300, files only. Paths with a segment starting with `.`, or named `Library`, `node_modules` or `target`, are excluded.

Errors: `"invalid term: …"`, `"invalid extension: …"`, `"nothing to search for"`, `"spotlight failed: …"`.

## `open_file` / `reveal_file` / `quick_look`

Args: `{ path: string }` (absolute, must exist)

Returns: `null`

Errors: `"not an absolute path"`, `"file not found: …"`, `"<tool> failed: …"`, on iOS `"not available on iOS yet"`.
