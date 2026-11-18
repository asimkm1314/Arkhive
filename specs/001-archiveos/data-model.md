# Data Model: ArchiveOS

## FileHit (returned by backend and by demo search)

| Field | Type | Rules |
|---|---|---|
| `name` | string | file name incl. extension |
| `ext` | string | lowercase, no dot; `""` if none |
| `path` | string | absolute path |
| `size` | number | bytes |
| `created` | number | ms since epoch (0 if unknown) |
| `modified` | number | ms since epoch |
| `snippet` | string \| null | ≤ ~160 chars around first content hit |
| `score` | number | 0 when browsing; see research R2 when searching |

Demo files add `text` (full fake contents, used to compute snippets) and are otherwise identical.

## Category (core.js `CATEGORIES`)

`{ key, label, sub, group, exts?: string[], keywords?: string[], recentDays?: number }`

- Format categories: PDF, PPT, JPEG, DOCX, XLSX, CODE, MEDIA, ZIP (match by `exts`).
- Smart clusters: MEDICAL, FINANCE, PROJECTS (match by `keywords` in name or text/snippet).
- RECENT: `recentDays: 7`.
- `group` drives the Tier 1 filter tabs: `docs | media | code | smart` (+ RECENT shows under All only).

## Query (core.js)

- `cleanQuery(raw) → string[]`: lowercase, split on non-letters/digits, drop stopwords and 1-char tokens, dedupe, max 16 terms, each truncated to 40 chars.
- `expandTerms(terms) → string[]`: terms + synonyms from `SYNONYMS` (e.g. `blood → hemoglobin, hematology, cbc, plasma, platelet, serum, transfusion, glucose, lipid, lab`), deduped, max 16.

## View state (index.html)

`landing → tier1 → tier2 → detail`, and back: `detail → tier2 → tier1 → landing`. Exposed as `document.body.dataset.view` for tests.
