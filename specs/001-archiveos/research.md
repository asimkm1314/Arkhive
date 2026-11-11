# Research: ArchiveOS

## R1. Content search source on macOS

- **Decision**: Spotlight via `mdfind -onlyin $HOME <query>`. One query per expanded term:
  `(kMDItemFSName == "*TERM*"cd || kMDItemTextContent == "TERM*"cdw)`, combined with
  `&& (kMDItemFSName == "*.ext"c || …)` for format filters and
  `kMDItemFSContentChangeDate >= $time.today(-N)` for Recent.
- **Rationale**: Spotlight already extracts text from PDF/DOCX/PPTX/XLSX/code, and from images via Live Text on Apple Silicon, and keeps itself current. Measured on the owner's Mac: content+extension query 0.25 s; 7-day recent query 1.7 s.
- **Alternatives**: SQLite FTS5 + own extractors + Vision OCR + FSEvents watcher (owner chose against it on 2026-11-11: it would duplicate Spotlight in more than 1,500 lines).

## R2. Relevance without Spotlight scores

- **Decision**: `mdfind` returns no score. Run one query per term in parallel threads. Score = Σ over terms (3 if the term is in the file name, else 1 for a content hit). Ties break on newest modified date.
- **Rationale**: Files hit by more of the expanded terms ("blood" + "hemoglobin" + "CBC") rank higher, which matches intent. The rule is easy to test.

## R3. Match snippets for real files

- **Decision**: `mdimport -t -d3 <path>` prints `kMDItemTextContent = "…";` with `\n`, `\"`, `\\`, `\Uxxxx` escapes. Parse that line, decode escapes, cut ~160 chars around the first term hit. Done only for the top 6 content hits, in parallel. Plain-text files on iOS are read directly (first 256 KB).
- **Rationale**: Reuses Spotlight's own extracted text. Measured 0.7 s for one file, 1.5 s for 6 in parallel, 5.3 s for 24; 6 keeps a search near the ~2 s target. Other results show no snippet until a later lazy-snippet change (T902).

## R4. Native actions

- **Decision**: `open <path>` (default app), `open -R <path>` (reveal in Finder), `qlmanage -p <path>` (Quick Look, spawned and not awaited). All use `std::process::Command` argument arrays.
- **Rationale**: Built into macOS; no Tauri plugin needed.
- **Alternatives**: `tauri-plugin-opener` (adds a dependency for two of three actions and still leaves Quick Look unsolved).

## R5. iOS scope

- **Finding**: `tauri-plugin-dialog` returns `FolderPickerNotImplemented` for folder picking on mobile, so "pick a folder" needs a custom Swift plugin.
- **Decision**: On iOS, search the app's own Documents folder (recursive walk, names and plain-text contents). Set `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` so the owner can put files and folders there through the Files app ("On My iPhone › ArchiveOS"). Native actions return a clear "not available on iOS yet" error.
- **Rationale**: Gives the owner a folder they control without a Swift plugin. Follow-up: a document-picker plugin with security-scoped bookmarks (T901).

## R6. Frontend packaging

- **Decision**: `app/index.html` + `app/core.js` (classic script, sets `globalThis.ArchiveCore`, and `module.exports` when present). Tauri serves `app/` as `frontendDist`, with `withGlobalTauri: true` so the page calls `window.__TAURI__.core.invoke` with no bundler.
- **Rationale**: Opens from `file://` (ES modules would be blocked) and is importable by `node --test`.

## R7. Category assignment

- **Decision**: Only JS (`core.js`) maps extension → format category and keywords → smart cluster. Rust returns raw extension + snippet. Recent = modified within 7 days.
- **Rationale**: Keeps the mapping in one place for both demo data and real data.
