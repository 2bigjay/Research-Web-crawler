# Phase 2 — HTML Parsing & Scraping

## Objective

Turn the raw HTML we can fetch (Phase 1) into structured, useful information:
page title, headings, paragraphs, links, and metadata — using Cheerio.

## Concepts Learned

### Crawling vs Scraping

- **Crawling** = *discovering* pages. You follow links to find URLs you have not
  visited yet. A crawler asks *"what else can I visit?"*
- **Scraping** = *extracting* information from a single page you already have.
  A scraper asks *"what useful data is in THIS page?"*

Phase 1 gave us the transport (fetch HTML). Phase 2 gives us the extraction
(scrape). Phase 3 will combine them into a crawler: fetch a page → scrape it →
follow its links → fetch those pages → repeat, within safety limits.

### CSS selectors

Cheerio loads HTML and lets you query it like the browser's `querySelectorAll`:
`$('title')`, `$('h1')`, `$('meta[name="description"]')`, `$('a[href]')`.
We use selectors to find elements without touching raw string parsing.

### Why NOT regex for HTML

HTML is deeply nested and irregular. Regex `/<h1>(.*?)<\/h1>/` breaks the moment
a page has attributes, nested tags, uppercase tags, or comments in the way.
A real DOM parser (Cheerio) understands document structure instead.

### `new URL(href, baseUrl)` relative resolution

Anchor tags usually have relative hrefs (`/about`, `../docs`). Join them to the
page URL to get absolute URLs — the form the future crawler needs so it can
enqueue and compare them. This also handles protocol-relative URLs (`//other.com`).

### Metadata vs visible content

The `<head>` of a page carries machine-facing metadata (`description`, keywords,
canonical URL). The `<body>` carries human-facing content (headings, paragraphs).
A scraper extracts both.

### Real-world variability

Sites do not always provide expected metadata — Wikipedia currently ships no
`<meta name="description">` at all. A scraper must handle missing fields
gracefully (empty string, not a crash).

## Technology Used

- Cheerio (added this phase) — HTML parsing + jQuery-like selectors
- Node's `URL` for relative link resolution
- Phase 1's `fetchWebPage` service for retrieving the HTML
- ES Modules

### Dependency decision: Cheerio (Rule 5)

- **What it does:** loads an HTML string into a queryable DOM; CSS selectors extract elements.
- **Why we need it:** Node has no DOM API; regex HTML parsing is unreliable.
- **Alternatives:**
  - *regex* — fragile, breaks on real markup
  - *jsdom* — full browser simulation, heavy and slow for read-only scraping
  - *parse5* — low-level parser, no friendly query API
  - *linkedom* — lightweight DOM but less scraping-focused tooling
- **Chosen:** Cheerio — purpose-built for scraping, tiny, fast, well-documented.
- **Trade-off:** it is a *read-only* DOM; you cannot run page JavaScript. That is
  fine for our server-side scraping (and deliberately so: we never execute
  scripts from crawled pages).

## What I Built

- `src/services/scraperService.js` — `scrapePage(html, pageUrl)`
  returns `{ title, metaDescription, metaKeywords, canonical, headings, paragraphs, links }`
  - `headings`: `{ level, text }[]` for `h1`–`h3`
  - `links`: deduplicated absolute URLs `{ href, text }[]`
  - `resolveUrl()` helper joins relative hrefs to the page URL, skipping
    `javascript:` / `mailto:` / malformed references
  - `cleanText()` collapses whitespace (full cleaning is Phase 5)
- `src/scripts/scrape-demo.js` — CLI harness: fetch + scrape + pretty-print
- `package.json` — `npm run scrape-demo` script

## Architecture

```
npm run scrape-demo -- https://example.com
        │
        ▼
webFetcherService.fetchWebPage()   → { html, status, contentType, ... }   (Phase 1)
        │ html
        ▼
scraperService.scrapePage(html, url) → structured page  (Phase 2)
        │
        ▼
console: title / headings / paragraphs / links
```

Two clean layers. The scraper never touches HTTP; the fetcher never touches HTML.

## Implementation

### Inside `scrapePage`

```
cheerio.load(html)  →  $ (queryable document)
        │
        ├─ $('title')                      → page title
        ├─ $('meta[name=description]')     → description
        ├─ $('h1,h2,h3').each()            → headings w/ level
        ├─ $('p').each()                   → paragraph texts
        └─ $('a[href]').each()             → absolute, deduplicated links
```

### Key details

- **Link deduplication with a `Set`** — navigation menus repeat the same URL
  many times. A `Set` keeps the first occurrence only, for free.
- **Level from `tagName`** — `el.tagName` is `"H2"` in Cheerio; `slice(1)` gives
  the number, so no selector hard-coding per level.
- **`resolveUrl` returns null** for non-web schemes — `javascript:` and `mailto:`
  links would pollute the queue in Phase 3.
- **`cleanText` is minimal on purpose** — whitespace collapse only. Entity
  decoding, duplicate paragraphs, malformed-URL repair are Phase 5's job,
  avoided here so each phase's responsibility stays crisp.

## Problems Encountered

### Problem 1 — Wikipedia shows no meta description

### Error / Observation

`metaDescription: (none)` when scraping `en.wikipedia.org/wiki/Robotics`.

### What I Initially Thought

Our selector was wrong or the attribute name differed.

### Actual Cause

Verified against the raw HTML: `rg -o 'meta name="description"'` finds **zero**
matches. Wikipedia genuinely ships no description meta tag today.

### Solution

None — the scraper is correct. Downgraded to an observation: **sites are not
obligated to provide the metadata you expect.** The scraper's empty-string
handling is the correct defensive behaviour.

### What I Learned

Test scrapers against many sites, not one. Missing fields are normal; the
extraction layer must degrade gracefully, and research extraction (Phase 4)
should rely on *content*, not on optional metadata.

### Problem 2 — `whatwg-encoding` deprecation warning during install

### Cause

Cheerio depends on `whatwg-encoding`, which npm flags deprecated. Transitive,
not our code.

### Solution

None required now. `npm audit` reports **0 vulnerabilities**. Re-evaluate if
Cheerio moves off it.

### What I Learned

Deprecation warnings from transitive dependencies are common and worth a note,
not panic.

## Testing

**Method:** real webpages over the network.

| Test | Command | Result |
|------|---------|--------|
| Minimal site | `npm run scrape-demo -- https://example.com` | Title `Example Domain`, 1 heading, 2 paragraphs, 1 link resolved absolute |
| Rich site | `npm run scrape-demo -- https://en.wikipedia.org/wiki/Robotics` | 17 headings (levels mixed), 56 paragraphs, canonical URL, 1742 deduplicated absolute links |
| Missing metadata (real) | Wikipedia scrape | `metaDescription: (none)` — verified genuine absence |

The Wikipedia run also previews Phase 3's necessity: 1742 links from one page is
exactly why the crawler needs `MAX_PAGES` / `MAX_DEPTH` caps and same-domain
filtering.

## Result

- [x] Extract page title
- [x] Extract metadata (description, keywords, canonical)
- [x] Extract headings `h1`–`h3` with levels
- [x] Extract paragraphs
- [x] Extract links as absolute, deduplicated URLs
- [x] Graceful handling of missing/malformed data
- [x] Cheerio dependency justified and documented
- [x] Crawl-vs-scrape distinction documented

## Next Phase

**Phase 3 — Crawler Engine:** combine fetch + scrape into a real crawler with a
URL queue, visited-set, depth & page limits, same-domain restriction, request
delays, timeouts, and proper error handling — governed by conservative,
configurable limits.

---

## Problem Log

| Date | Phase | Problem | Error | Initially thought | Actual cause | Solution | What I learned |
|------|-------|---------|-------|-------------------|--------------|----------|----------------|
| 2026-09-10 | 2 | No meta description on Wikipedia | `(none)` | Wrong selector name | Wikipedia ships no description meta tag | Verified against raw HTML; keep defensive empty-string handling | Test on many sites; sites are not obligated to provide expected metadata |
| 2026-09-10 | 2 | Install-time deprecation warning (`whatwg-encoding`) | npm warning | Our mistake | Transitive Cheerio dependency | None; audit clean | Transitive deprecations need watching, not action |

## Technical Decision Log

| Decision | Alternatives | Chosen option | Reason | Trade-offs |
|----------|--------------|---------------|--------|------------|
| HTML parser | regex, jsdom, parse5, linkedom | Cheerio | Purpose-built for scraping, fast, great docs | Read-only DOM; cannot run page JS |
| Text cleaning now vs later | Full normalize now | Minimal whitespace collapse | Cleaning is its own phase (5) with explicit rules | Scraped output is not final-grade yet |
| Link form stored | relative as-is | Absolute URLs | Crawler queue needs absolute, comparable URLs | URL normalization/sub-domain decisions defer to Phase 3/5 |
| Scriptability of scraped pages | — | Never execute page JS | Security: crawled code must not run here | Some JS-rendered sites yield little |

---

## Notes for the Future Crawler (short)

- One Wikipedia page → 1742 links. Capping and domain filtering are not optional.
- Links to fragments (`/wiki/Robotics#bodyContent`) and special pages
  (`Special:Random`) will need pruning — that lands in Phase 3/5.