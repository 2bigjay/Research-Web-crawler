# Phase 3 — Crawler Engine

## Objective

Combine Phase 1 (fetch) and Phase 2 (scrape) into a real **crawler**: start at
one URL, follow in-domain links, remember what it planned, respect depth and
page limits, pace its requests politely, and never leave the permitted site.

## Concepts Learned

### The URL queue — a to-do list

A crawler cannot fetch everything at once. It keeps a **queue**: a to-do list of
URLs still waiting to be visited.

- **How URLs enter:** the start URL first, then every new in-domain link found
  on scraped pages.
- **How URLs leave:** when the crawler is ready for the next page, it takes the
  first item off (`queue.shift()`).
- **Why FIFO:** taking oldest-first means breadth-first search (BFS) — we finish
  one "level" of a site (depth 0, then 1, then 2) before going deeper. That's
  ideal for research crawling: broad coverage of a topic early.

### The visited set — never twice

Without deduplication a crawler loops forever (page A links B, B links A).
The **visited set** records every URL the crawler has *planned*. When a link is
discovered it is checked against the set; if already known, it is dropped.

Visited is a `Set`, giving O(1) membership checks. Crucially, we add URLs to the
set **at enqueue time**, not at fetch time — a URL discovered from two different
parents is claimed once, so the queue never fills with duplicates.

### Normalization — "same page" in many spellings

`page#a` and `page#b` are the same page. We found `https://books.toscrape.com/`
and `.../index.html` too. `normalizeUrl` produces one canonical form per page:
fragment stripped, hostname lowercased, empty path → `/`. Without this, the
visited set would treat the same page as many different URLs. (Collapsing
`/index.html` → `/` is duplicate-*page* detection — bigger cleaning so it is
deferred to Phase 5.)

### Same-domain restriction

After scraping, every link is resolved to an absolute URL. The crawler keeps a
link **only if its hostname matches the start URL's hostname**. This is the
primary reason crawlers don't run away across the internet:

- example.com links only to `iana.org` → iana.org is rejected → 1 page total.
- One Wikipedia page exposed **1742 links**, almost all other-domain/repeat.

### Depth and page caps — the hard stop

- **Depth** = how many links away from the start we allow. Start = 0; links
  found on depth-1 pages are only enqueued if `depth < maxDepth`.
- **Pages** = how many HTML pages we scrape before stopping.
- The loop condition enforces the cap: `while (queue.length && results.length < maxPages)`.

### Request delay — politeness as code

A crawler hitting a site 100 times/second is an attack. A **delay** between
requests paces us. Default 1000ms (1 request/second), overridable. Rate control
is further hardened in Phase 8 (bottleneck-class tools + robots.txt).

### Every failure is recorded, never thrown away

A failed page is not a fatal error. `errors[]` collects `{ url, kind, message }`
so the crawl continues and the operator can review what broke.

## Technology Used

- Node built-ins: `URL`, `Set`, `setTimeout`
- Our own `webFetcherService`, `scraperService`, new `urlUtils`
- No new dependencies (deliberate: queue via plain array is fine at ≤ 20 pages)

## What I Built

- `src/utils/urlUtils.js`
  - `normalizeUrl()` — canonical form (https-only, fragment stripped, host lowercased)
  - `isSameDomain()` / `getHostname()` — on-site enforcement
- `src/services/crawlerService.js` — `crawlWeb({ startUrl, maxPages, maxDepth, requestDelayMs, timeoutMs })`
  - BFS queue, visited set, depth/page caps, delay pacing, per-URL error collection
  - Config precedence: **explicit options > `.env` > constants**
- `src/scripts/crawl-demo.js` — CLI harness printing a crawl summary
- `.env` / `.env.example` — `CRAWL_MAX_PAGES`, `CRAWL_MAX_DEPTH`, `CRAWL_DELAY_MS`, `CRAWL_TIMEOUT_MS`

## Architecture

```
crawlWeb({ startUrl, maxPages: 20, maxDepth: 2, ... })
        │
        ▼
queue = [{start, depth 0}]  visited = {start}
        │
        ▼   loop while queue non-empty AND pages < max
   fetchWebPage(url)        → { status, isHtml, html }     ⏮ Phase 1
        │ (200 + HTML?)
        ▼
   scrapePage(html, url)    → { title, links, ... }         ⏮ Phase 2
        │
        ├── record result (depth, status, title, scraped)
        │
        └── depth < maxDepth?
              └── for each link:
                    normalize → same-domain? → not visited?
                          └── visited.add(); queue.push(depth+1)
        │
        ▼
   sleep(requestDelayMs)    → politeness
        │
        ▼
   return { startUrl, config, summary, errors, results }
```

A layered pipeline. The crawler owns *policies* (what to follow, when to stop);
the fetcher owns *transport*; the scraper owns *extraction*.

## Implementation

### Key details

- **Options override env override defaults** — `resolveConfig` gives the safest,
  least-surprising precedence: code running with explicit limits can never be
  silently dictated to by stale env values.
- **Redirects can leave the domain** — after a redirect, `response.url` may not
  share our host. We check and skip instead of blindly scraping.
- **`visited` marks at enqueue time** — claims a URL even before fetching it, so
  two pages can't both enqueue the same child.
- **`sleep` in a `finally`-free flow** — every path (success, HTTP error, fetch
  throw) still hits the delay, so pause pacing holds even when things fail.
- **`envInt` guards malformed env values** — `CRAWL_DELAY_MS=abc` falls back to
  the default instead of crashing or silently zero-delaying.

## Problems Encountered

### Problem 1 — `/index.html` crawled as a separate page from `/`

### Observation

`https://books.toscrape.com/` and `https://books.toscrape.com/index.html`
are the same page; both appeared in the crawl results.

### Initially thought

`normalizeUrl` would collapse them.

### Actual cause

Our normalization handles fragments/case/empty-path but not the site's own
"alternate spellings of the same document" (`index.html`). Detecting truly
identical pages needs content comparison (titles, body hash) — that is Phase 5
"duplicate pages" territory.

### Solution

Recorded as a known limitation. Correct behaviour for this phase: both are
legal URLs on the permit domain; deduplicating them is a cleaning concern.

### What I Learned

URL normalization and page deduplication are two different problems. The visited
set needs URL normalization; *content* duplication needs later phases.

### Problem 2 — None blocking

The engine worked first run against both test sites. No other issues logged.

## Testing

| Test | Command | Result |
|------|---------|--------|
| Out-of-domain filter | `npm run crawl-demo -- https://example.com --delay 200` | 1 page; `iana.org` link rejected; queue exhausted |
| Multi-page BFS | `npm run crawl-demo -- https://books.toscrape.com --max-pages 9 --delay 300` | d0 homepage → d1 eight categories; cap reached at 9; 175 URLs planned (dedupe!), 0 errors |
| Depth cap visible | same run | no depth-2 pages enqueued before cap |
| Invalid start URL | `npm run crawl-demo -- not-a-url` | `Crawl failed: Invalid start URL`, exit 1 |

The 175-planned-vs-9-crawled number is the clearest proof the queue + visited
set work: discovery outpaced the page cap, exactly as a safe crawler should.

## Result

- [x] URL queue (FIFO/BFS) with depth tagging
- [x] Visited set with canonical URL deduplication
- [x] Link discovery from scraped pages
- [x] Depth limit (`MAX_DEPTH`)
- [x] Page limit (`MAX_PAGES`)
- [x] Same-domain restriction
- [x] Politeness delay between requests
- [x] Per-request timeout
- [x] Per-URL error recording (crawl never dies on one bad page)
- [x] Limits configurable via options + `.env`
- [x] No bypass mechanisms (we stay on-domain, public, HTML only)

## Next Phase

**Phase 4 — Research Extraction Engine:** generalize scraping toward topic
research (e.g. *Robotics companies* → name, description, products, country,
website) with an extraction layer built to accept new topics later.

---

## Problem Log

| Date | Phase | Problem | Error | Initially thought | Actual cause | Solution | What I learned |
|------|-------|---------|-------|-------------------|--------------|----------|----------------|
| 2026-09-10 | 3 | `/index.html` and `/` crawled as separate pages | Two results, same content | `normalizeUrl` should merge them | Not a URL-canonicalization issue — same document, different spelling | Logged as known limitation → Phase 5 duplicate-page cleaning | URL normalization ≠ page deduplication |
| 2026-09-10 | 3 | None blocking | — | — | — | Engine worked first run on both sites | Verify against minimal and rich sites |

## Technical Decision Log

| Decision | Alternatives | Chosen option | Reason | Trade-offs |
|----------|--------------|---------------|--------|------------|
| Traversal order | DFS (LIFO stack) | BFS (FIFO queue) | Broad coverage per depth level suits research; shallowest-first | More spread may reach page cap before deep-diving |
| Queue impl | linked list, priority queue | plain array + `shift()` | ≤ 20 pages; simplest to read and explain | O(n) shift — irrelevant at our caps |
| Visited marking | at fetch time | at enqueue time | Claims URLs once; no duplicate queue entries | A planned-but-failed page stays claimed |
| Config | env only / code only | options > env > defaults | Explicit, testable, safe precedence | Three-source resolution needs docs |
| Redirect handling | trust blindly | verify final URL stays on-domain | Never scrape outside permit | Slightly more code |
| Duplicate pages | collapse now | defer to Phase 5 | Scope discipline; needs content comparison | Both spellings crawled in Phase 3 |
| Rate control | full bottleneck lib | `sleep()` delay | Needed dependency deferred to Phase 8 | Delay is coarse (no adaptive limits yet) |

---

## Teaching aside — the queue, told again

Imagine a to-do list on a physical desk.

1. You write the start URL on a card and hand it to the crawler.
2. It reads the card, fetches the page, and scrapes out its links.
3. For each *new, on-domain* link it writes a new card and places it at the
   **back** of the stack of cards.
4. It always takes the next card from the **front** (oldest first).
5. Before starting, it checks the card isn't already claimed by peeking at the
   wall of "claimed cards" — the visited set. Already claimed → card goes in
   the bin.
6. Two extra rules stop it working forever: a card may only be accepted if the
   trail to it is ≤ `maxDepth` links long, and the desk has room for only
   `maxPages` finished pages.

That's the entire crawler. Everything else in this phase is safety and polish.