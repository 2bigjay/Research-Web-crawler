# Phase 4 — Research Extraction Engine

## Objective

Move from generic scraping toward **structured research**. The crawler should
extract *topic-specific* information — e.g. for a **robotics companies** topic:
company name, description, products, country, website, relevant links — while
being designed so new research topics can be added later without touching the core.

## Concepts Learned

### Scraping vs extraction

- **Scraping (Phase 2)** — mechanically pull the page's raw structure:
  every heading, every paragraph.
- **Extraction (Phase 4)** — *interpret* that structure for a purpose:
  "this is a company; its products are likely these list items."

### The registry pattern

Instead of a big `switch (topic)` we keep a `Map` of **extractors**. Adding the
topic "biotech-companies" means writing one module and one registration line.
The engine (`extractResearch`) stays byte-for-byte identical. This is the
Open/Closed principle in miniature: *open for extension, closed for modification*.

### Honest heuristics

Extraction is hand-written rules until Phase 10's AI:
- Heuristics can be **wrong** ("Collaborative Robots & Cobots" parsed as a
  company name — it's the page headline, not the company).
- Heuristics can be **unsure** — we *return null* instead of guessing
  (Universal Robots' "founded in Denmark" phrasing did not match our
  `based in / located in` pattern, so country stayed null).
- Null is data: "no confident answer" is better than a fabricated fact in a
  research database.

### Extractor source material

To give extractors richer material, the scraper now also returns:
- `siteName` — the site's own name (`og:site_name`), more trustworthy than a title
- `listItems` — short `<li>` texts (product menus, feature lists) that heuristics
  probe for product hints

Both are extracted with Cheerio inside the **scraper layer**; extractors thus
stay pure functions over plain data (easy to test, no HTML knowledge needed).

### Separating concerns

`extractionService` owns *policy* (registry, shape checks, blank→null), while
`extractors/roboticsCompanies.js` owns *domain knowledge* (what a robotics
company looks like). Neither touches HTTP or HTML parsing.

## Technology Used

- Existing Cheerio scraper (extended with two fields)
- Node built-ins only — no new dependencies

## What I Built

- Scraper extension: `siteName`, `listItems` added to `scrapePage` output
- `src/services/extractionService.js`
  - `registerExtractor(topic, { extract })` — registry
  - `getTopics()`, `extractResearch(page, topic)`
  - Engine-side guards: non-empty topic, extractor shape, object result, blank→null
- `src/services/extractors/roboticsCompanies.js` — the first topic: heuristics
  for company name, description, products, country, website, relevant links
- `src/services/extractors/index.js` — built-in registration point
- `src/scripts/extract-demo.js` + `npm run extract-demo`

## Architecture

```
crawl (Phase 3) produces pages: { url, title, siteName, headings, paragraphs, listItems, links }
        │
        ▼
extractResearch(page, "robotics-companies")
        │  registry lookup
        ▼
extractors/roboticsCompanies.extract(page)
        │  heuristics per field
        ▼
{ companyName, description, products, country, website, relevantLinks }
        (null where uncertain)
```

Adding a topic = new file in `extractors/` + one line in `index.js`.

## Implementation

### Registry

```js
const extractors = new Map();
registerExtractor(topic, { extract })  →  extractors.set(topic, extractor)
extractResearch(page, topic)           →  extractor.extract(page) + shape normalization
```

Guards turn programmer mistakes into loud errors: registering without an
`extract` function, or an unknown topic, throws with a helpful message that
lists available topics.

### `roboticsCompanies` heuristics (honest inventory)

| Field | Rule | Weakness (confirmed live) |
|-------|------|---------------------------|
| `companyName` | `og:site_name` → first token of title | Headline-first titles: "Collaborative Robots & Cobots \| Universal Robots" → headline chosen |
| `description` | meta description → first paragraph >120 chars | — |
| `products` | only trust `listItems` when a product-ish heading exists | Nav menu items leak in (UR.com, Academy…) |
| `country` | `based in / located in / HQ…` phrase + whitelist match | "outside Odense, Denmark" phrasing missed → null |
| `website` | canonical → arrival URL | — |
| `relevantLinks` | links whose text/URL match about/contact/products… | — |

The notes in the right column are deliberate: they describe real observations
from testing universal-robots.com, and they define Phase 10's AI backlog.

### Engine-side cleanup

`blankToNull` converts `""`/`undefined` scalars to `null` so downstream code
(Phase 6 database) treats *missing* and *empty* identically. Arrays stay arrays.

## Problems Encountered

### Problem 1 — "Company name" took the page headline, not the company

### Observation

Universal Robots homepage title is *"Collaborative Robots & Cobots | Universal
Robots"*; our heuristic returned *"Collaborative Robots & Cobots"*.

### Initially thought

`og:site_name` would always exist. It does **not** (absent on that site), so
the title fallback decided.

### Actual cause

The heuristic assumed the conventional `Company | Tagline` title order. UR uses
`Headline | Company` order — equally common.

### Solution

Kept the heuristic but documented the ambiguity honestly. Fixing title parsing
on real-world variance is exactly what Phase 10 AI (and a curated dataset) is for.

### What I Learned

Title conventions are not a standard. Heuristics need to admit uncertainty, and
"wrong but confident" metadata poisons research data more than "null".

### Problem 2 — country always null on universal-robots.com

### Cause

The site says "outside the city of Odense, Denmark" style phrasing — no match
for our `based in / located in` locators.

### Solution

Null is correct behaviour. The real fix is better NLP, not more regexes.

### What I Learned

A heuristic that returns "no guess" is trustworthy; expanding hairy regexes to
force a guess would reduce trust.

## Testing

| Test | Command | Result |
|------|---------|--------|
| Registry load + unknown topic | `node -e` module probe | `TOPICS: robotics-companies`; unknown topic → clear error listing topics |
| Engine shape check + blank→null | `node -e` with synthetic page | `RoboCorp` item; `products/country` null where absent |
| Real company site | `npm run extract-demo -- https://www.universal-robots.com --topic robotics-companies` | 6 pages, 0 failures; description/website/relevantLinks strong; name/country heuristically imperfect (logged) |

The engine (registry + guards) is 100% correct. Domain heuristics work where
the web follows conventions and honestly return null where it does not.

## Result

- [x] Topic-driven extraction with an extensible registry (new topics = new modules)
- [x] Example topic `robotics-companies` with all six planned fields
- [x] Added extractor source material to the scraper (`siteName`, `listItems`)
- [x] Conservative heuristics that return null when unsure
- [x] Friendly errors for unknown topics / malformed extractors
- [x] No new dependencies
- [x] Documented heuristic weaknesses (Phase 10 AI backlog)

## Next Phase

**Phase 5 — Data Processing & Cleaning:** normalize what raw scraping/extraction
produce — whitespace, duplicates, empty fields, relative/malformed URLs, HTML
entities, inconsistent text — as reusable utility functions (textUtils, urlUtils
extensions, cleaningService), then re-run reviews over the crawler pipeline.

---

## Problem Log

| Date | Phase | Problem | Error | Initially thought | Actual cause | Solution | What I learned |
|------|-------|---------|-------|-------------------|--------------|----------|----------------|
| 2026-09-10 | 4 | Company name = page headline not company | "Collaborative Robots & Cobots" | `og:site_name` always present | UR titles use `Headline \| Company` order; og absent | Keep heuristic, log ambiguity for Phase 10 | Title order is not standardized; wrong-confident beats null harmful |
| 2026-09-10 | 4 | Country always null on UR site | `country: (none)` | Regex too narrow | Site phrasing: "outside …, Denmark" | Null correct; better NLP later | "No guess" is trustworthy data |

## Technical Decision Log

| Decision | Alternatives | Chosen option | Reason | Trade-offs |
|----------|--------------|---------------|--------|------------|
| Topic dispatch | `switch(topic)` | Registry `Map` + per-topic module | Open/Closed: new topics never touch the engine | One more indirection |
| Extractor input | raw HTML + Cheerio | plain scraped structure | Extractors stay pure/testable; no repeated parsing | Must extend scraper when new input is needed |
| Confidence policy | force a guess | return null | Null ≠ error; avoid fabricated research data | Extraction may look sparse |
| Country guessing | big commons list | short whitelist + locator phrase | Fewer false positives | Misses (e.g. "Denmark" near Odense) |
| Product guessing | all list items | only with product-section heading | Noise reduction | Misses product pages with no such heading |

---

## Notes for the AI Phase (10)

Phase 4 logged these extraction weaknesses as the AI backlog:
- title → company name (ambiguous delimiter order)
- free-text → country (unbounded phrasing)
- nav menu → real product separation
- description synthesis when meta is absent