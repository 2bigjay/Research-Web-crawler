# Phase 5 — Data Processing & Cleaning

## Objective

Transform raw extracted information into clean, consistent data: collapse
whitespace, decode entities, drop empty fields, deduplicate values and pages,
repair malformed URLs — using **reusable utilities** rather than ad-hoc loops.

## Concepts Learned

### Raw scraped data is messy by default

Real pages produce: inline whitespace, HTML entities in metadata (Cheerio
decodes element *text* but **not** attribute values), duplicated menu items,
empty fields, `javascript:` links, and the same document under different URLs
(`/` vs `/index.html`). Cleaning is not optional polish; it is a pipeline stage.

### Convention-based cleaning (no per-topic schema)

The cleaner decides a field's treatment from its *name*: names matching
`url|website|href|canonical` are URLs (validate/repair), everything else is
text (decode + clean). New extractors get cleaned for free — no registry of
field types to maintain.

### Reusable utilities beat copy-paste

`cleanText` previously lived inside the scraper. Cleaning it needed the same
logic, so we **extracted it to `utils/textUtils.js`** and made the scraper
import it. One definition, three callers (scraper, cleaner, deduper). This is
the DRY principle applied at the utility level.

### Empty ≠ error, duplicates ≠ harmless

- `""` / `undefined` / `null` are normalized so that "missing" has one meaning.
- Duplicate products ("Cobot A" vs "cobot a") and duplicate links (same href)
  are dropped before they reach storage.
- Duplicate **pages** are caught two ways: by normalized URL, then by a
  **content fingerprint** (hash of title + first paragraph) — which is exactly
  the "/ == /index.html" case discovered in Phase 3.

### Repair, don't fabricate

`repairUrl` fixes what a crawler actually sees: surrounding quotes, missing
scheme (`example.com/about` → `https://example.com/about`). If it still won't
parse, we **drop** the value. A broken URL shipped to a database is worse than
none.

### Two bugs found by testing — and why tests matter

The first version of `cleanArray` let empty strings survive and let duplicate
link objects through. The Phase 5 unit run caught both. This is the pattern:
write the cleaner, feed it a dirty fixture, fix what it misses, then test
against the real pipeline.

## Technology Used

- Node built-ins only: `crypto` (sha256 fingerprints), `String.fromCodePoint`
- Phase 3's `urlUtils.normalizeUrl` reused by `repairUrl`
- No new dependencies

## What I Built

- `src/utils/textUtils.js`
  - `cleanText()` — collapse whitespace, trim, null-safe
  - `decodeHtmlEntities()` — numeric (`&#39;`, `&#x26;`) + named whitelist; safe
    against invalid code points; unknown entities left untouched
  - `isEmptyText()`
- `src/utils/urlUtils.js` — added `repairUrl()` (scheme fix + normalize or null)
- `scraperService.js` — refactored to import shared `cleanText` (removed copy)
- `src/services/cleaningService.js`
  - `cleanResearchItem(item)` — recursive field cleaning + dedupe + URL repair
  - `dedupeCrawlResults(pages)` — URL dedupe, then content-fingerprint dedupe
- `src/scripts/clean-demo.js` + `npm run clean-demo`

## Architecture

```
crawl results (Phase 3)
   │
   ▼
dedupeCrawlResults()   → drop duplicate URLs, duplicate content (sha256 of title+1st ¶)
   │
   ▼
extractResearch(page, topic)   (Phase 4)
   │
   ▼
cleanResearchItem()    → entity decode / whitespace / empty→drop / array dedupe / URL repair
   │
   ▼
clean, consistent research items → ready for a database (Phase 6)
```

Utility layer:
```
utils/textUtils  ← scraperService, cleaningService, pageFingerprint
utils/urlUtils   ← crawlerService, cleaningService
```

## Implementation

### `cleanValue(field, value)` dispatch

```
value is array       → cleanArray (per-element, dedupe, drop empties)
value is object      → cleanStructure (link objects: href required, else drop)
string + URL field   → repairUrl (else null)
string + text field  → decodeHtmlEntities(cleanText) → null if empty
```

### Dedupe keys

- plain strings: lowercase trimmed form
- link objects: `link:<href>` — the URL is a link's identity
- other values: `JSON.stringify`

### `dedupeCrawlResults` order matters

URL dedupe **first** (cheap, exact), content fingerprint **second** (expensive,
fuzzy). The content fingerprint is a heuristic: two unrelated pages *could*
collide on identical title+first-paragraph — rare and acceptable.

### Debug-narration comments

Comments explain the *whys*: why attribute values need entity decoding, why
`fromCodePoint` must be guarded, why href is a link's dedupe identity.

## Problems Encountered

### Problem 1 — empty strings survived array cleaning

### Observation

`products: ["Cobot A", "cobot a", "Arm", "", ...]` kept the trailing `""`.

### Initially thought

The `item === null` check would filter it.

### Actual cause

`cleanStructure('')` returns `''`, which is not null, so it passed the guard.
Emptiness was only checked for object/array shapes, not strings.

### Solution

Added an explicit `isEmptyText(item)` drop for string items in `cleanArray`,
plus the same for empty nested arrays.

### What I Learned

When a cleaner promises "drop empty values", test the *empty string* case
directly — null-checks don't imply empty-checks.

### Problem 2 — duplicate link objects slipped through

### Observation

`relevantLinks` contained the same repaired link twice.

### Cause

Dedupe only keyed plain strings, not cleaned objects.

### Solution

Keyed link objects by `link:<href>` in the same seen-set.

### What I Learned

Deduplication needs a definition of *identity* per data type. For links, a URL.

### Problem 3 — (observation, not bug) `javascript:` links and malformed URLs

Handled by design: `repairUrl` returns null → link dropped. Verified in tests.

## Testing

| Test | Result |
|------|--------|
| `decodeHtmlEntities("Vent&#39;s &amp; Sons &copy; &#x26;")` | `"Vent's & Sons © &"` |
| `cleanText("  Hello,\n    world   ")` | `"Hello, world"` |
| `cleanResearchItem` (dirty fixture) | entities decoded, whitespace fixed, `""` + duplicate products/links dropped, `javascript:` dropped, `example.com/acme` → `https://example.com/acme` |
| `dedupeCrawlResults` (3 pages, 2 identical) | `input:3 output:2 duplicateByContent:1` |
| `npm run clean-demo -- https://books.toscrape.com --max-pages 8` | 8 crawled → 7 kept, `duplicate content: 1` (the `/index.html` == `/` case), cleaning applied to every item |
| Scraper regression | `npm run scrape-demo -- https://example.com` still prints correct title/paragraphs/links after refactor |

## Result

- [x] Whitespace normalization (reusable `cleanText`)
- [x] HTML entity decoding for text and attribute-sourced values
- [x] Empty fields normalized to null / dropped
- [x] Duplicate values removed (strings + link objects, case-insensitive)
- [x] Malformed URL repair (`repairUrl`) with honest drop-on-fail
- [x] Duplicate page detection (URL + content fingerprint)
- [x] Pipelined: crawl → dedupe → extract → clean
- [x] Two real bugs found and fixed via dirty-fixture tests
- [x] No new dependencies

## Next Phase

**Phase 6 — Database:** persist crawl sessions (`CrawlSession`) and cleaned
research results (`ResearchResult`) in MongoDB Atlas via Mongoose, with careful
schemas instead of blob storage.

---

## Problem Log

| Date | Phase | Problem | Error | Initially thought | Actual cause | Solution | What I learned |
|------|-------|---------|-------|-------------------|--------------|----------|----------------|
| 2026-09-10 | 5 | Empty strings survived array cleaning | `products` kept `""` | null-check would filter it | `cleanStructure('')` returns `''`, not null | Explicit `isEmptyText` drop in `cleanArray` | null-check ≠ empty-check |
| 2026-09-10 | 5 | Duplicate links in `relevantLinks` | same href twice | — | Dedupe only covered plain strings | Keyed objects by `link:<href>` | Identity must be defined per type |

## Technical Decision Log

| Decision | Alternatives | Chosen option | Reason | Trade-offs |
|----------|--------------|---------------|--------|------------|
| Field-type detection | per-topic schema registry | name convention (`/url|website|href/`) | New extractors cleaned for free; no schema layer | Name-based guess can misfire on unusual fields |
| Entity decoding | `he` package | hand-rolled + whitelist | No new dependency; covers real cases | Unknown entities stay encoded |
| Page dedupe | URL only | URL + content fingerprint | Catches same-document-different-URL (`/index.html`) | Rare false positive on identical title+first ¶ |
| URL repair | always prepend https | preserve existing scheme; https fallback | Fewer broken guesses | http-only pages could be mistyped as https |
| Empty policy | keep `""` | normalize to null/drop | Single meaning for "missing" downstream | Some consumers must handle null |

---

## Notes for the Future

- Fingerprint field choice (title + first paragraph) is a tunable; DB phase may
  widen it to headings too.
- `repairUrl` could learn site-specific spellings later (trailing `index.html`
  from canonical links).