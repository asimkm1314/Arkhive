# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Desktop app (Tauri v2) on macOS first; iPhone build limited to the app's own Documents folder; Android deferred (T906, needs disk space). A browser preview reads a folder the owner chooses.

## Users

One owner: a person with a Mac full of their own documents (lab reports, decks, scans, code) who remembers what is *in* a file but not what it is called, and wants to find, open, move, rename or hand it on without going through Finder.

## Product Purpose

Arkhive is the owner's file manager and content search. Type or say a phrase ("find the file which has blood related") and get the file whose contents match, even when its name says nothing (`Scan_Nov_10.pdf`). Success: the right file is on the shelf within about two seconds and opens in one click.

## Positioning

Search reads inside files through Arkhive's own SQLite index (PDF, Office and code text, and OCR text in images; Spotlight fills in while the index is still reading), with a small related-words table that turns everyday phrases into the terms documents actually use. Files are browsed as a tactile 3D shelf of real covers rather than a list, and open in Arkhive's own viewer rather than in Finder.

## Operating Context

- Every Finder-visible item in the home folder, plus iCloud Drive and Applications; hidden files, ~/Library, node_modules and target are left out.
- Keyboard first: `←` `→`, Enter, `/` or `⌘K`, `V` for voice, Esc, Space for Quick Look.
- Files leave the app by drag into Finder, Mail or any app, or through the export tray.

## Capabilities and Constraints

- Own index: SQLite FTS5 at the app data folder, kept live by FSEvents (owner brief 2026-11-14, replacing the earlier Spotlight-only decision).
- Files open inside Arkhive: PDF, pictures and media from disk; Word, PowerPoint and Excel through Quick Look pages; text and code as text. Nothing is handed to Finder unless the owner asks.
- macOS privacy prompts (Desktop, Documents, Downloads, Full Disk Access) cannot be bypassed by an app; Arkhive detects missing access and links to the setting.
- Rename never replaces another file; Trash goes through Finder so files can be put back.
- English only. No demo files; everything shown is the owner's own.

## Brand Commitments

- Name: Arkhive, wordmark "ARKHIVE".
- Palette (owner's brief, binding): Soft Beige `#EDE6DA`, Sheet Beige `#F5EFE6`, Deep Mocha `#261A14`, Warm Mocha `#5C463B`, Muted Mocha `#8A7367`, Forest `#234434`, Forest Light `#3A634C`, Dull Gold `#B89658`, across the start screen and the vault.
- Faces (owner's brief): Inter Tight for the wordmark, buttons and labels; Newsreader for file titles and excerpts.
- Two-dot cursor. Labels in one case throughout, never in square brackets ("SORT · …", "← HOME", "← ALL VAULTS"), bold and boxy buttons (owner brief 2026-11-16).

## Evidence on Hand

The owner's real files only. No testimonials, metrics or sample data exist, and none may be invented; status lines report real counts or say they are unknown.

## Product Principles

1. The file is the hero: every surface shows the owner's real files and real counts.
2. Find by meaning, then act in place: view inside Arkhive, rename, move, trash, drag out.
3. Honest about the machine: say what macOS blocks and how to allow it.
4. Keyboard and voice reach everything the pointer does.

## Accessibility & Inclusion

Keyboard operation for every action, visible focus, reduced-motion path that still completes every flow (covered by a UI test).
