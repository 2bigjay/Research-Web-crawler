# Phase 6 — Database

## Objective

Persist crawl sessions and research results so nothing is lost when the process
exits. Use MongoDB Atlas + Mongoose with **carefully designed schemas** rather
than one unstructured blob per document.

## Concepts Learned

### Connecting is a dependency, not a given

The server must boot without a database (health checks, earlier-phase demos).
So connection is **explicit and optional**: `connectDatabase()` is called by
callers; a missing `MONGODB_URI` or unreachable Atlas logs a warning instead of
crashing startup. A short `serverSelectionTimeoutMS` (5s) stops startup from
hanging on an unreachable cluster.

### Schema design over blobs

`CrawlSession` and `ResearchResult` are separate collections with real fields:

- **CrawlSession** holds the *run*: start URL, topic, status enum, the limits
  that were in force, roll-up summary counts, per-URL errors as subdocuments.
  Summary numbers let you answer "how many pages did last week's crawls cover?"
  without loading every page document.
- **ResearchResult** holds *one page*: URL, title, source host, topic, HTTP
  status, paragraph content, and `extracted` structured research data, linked
  to its session by ObjectId.

### Why `extracted` is `Schema.Types.Mixed`

Research fields differ per topic (robotics-companies has `products`/`country`;
another topic won't). Forcing one shape would either bury everything in strings
or kill Phase 4's "add a topic freely" design. Mixed is the honest trade-off:
we still validate the architecture — the fixed fields (`url`, `title`, `topic`,
`session`) are typed, indexed, and required.

### Indexes are data-model decisions

- `{ session, url }` unique → the same page can't be saved twice for one crawl.
- `session`, `topic`, `url` single-field indexes → Phase 7's filtering/search.

### The reserved-name trap

Mongoose reserves some pathnames. `errors` collided with Mongoose's own
validation-error map and raised a runtime warning with real risk of subtle
breakage — renamed to `crawlErrors`. Constraint tools exist to warn you; the
fix is to respect them.

### Reserved cascade

`extractResearch` + `cleanResearchItem` run *before* save, so the database only
ever sees cleaned, structured data — matching Phase 5's objective that the DB
stores final-grade output.

## Technology Used

- **Mongoose** (added) — schema/validation/query layer for MongoDB.
  - *Why:* the standard Node ODM for Atlas; schema model matches the project's
    "design carefully" goal.
  - *Alternatives:* raw `mongodb` driver (hand-rolled validation), Prisma
    (heavier, designed more for SQL/type-safe backends).
  - *Trade-offs:* ODM magic (buffering, middleware) can hide what the driver
    does; worth learning the raw driver's model later.
- **MongoDB Atlas** — the user's free M0 cluster.

## What I Built

- `src/config/database.js` — `connectDatabase`, `disconnectDatabase`,
  `isDatabaseConnected`, `databaseStatusText` (env-driven URI, 5s timeout)
- `src/models/CrawlSession.js` — session schema (status enum, config snapshot,
  summary rollup, `crawlErrors` subdocuments, timestamps)
- `src/models/ResearchResult.js` — page schema (session ref, indexes,
  `extracted: Mixed`, content paragraphs, unique `{session,url}`)
- `src/services/researchService.js` — `saveCrawl({ crawl, topic })` composing
  crawl → extract → clean → persist; plus `getCrawlSession(s)`, `getCrawlSessions`,
  `getResearchResults`
- `server.js` — optional boot-time connect + `database` field in `/api/health`
- `src/scripts/db-demo.js` + `npm run db-demo`
- `.env` / `.env.example` — `MONGODB_URI`

## Architecture

```
npm run db-demo -- https://example.com
        │
        ▼
connectDatabase()  →  mongoose.connect(MONGODB_URI)(5s timeout, non-fatal)
        │
        ▼
crawlWeb()            (Phase 3)
        │
        ▼
saveCrawl({ crawl, topic })
   ├── CrawlSession.create()          ← run metadata + summary
   └── for each page:
         extractResearch → cleanResearchItem → ResearchResult.insertMany()
        │
        ▼
getCrawlSession / getResearchResults   ← read-back (Phase 7 builds on these)
        │
        ▼
disconnectDatabase()
```

Server mode: `app.listen` + optional connect → `/api/health` reports
`"database": "connected" | "disconnected"`.

## Implementation

### `saveCrawl` flow

```
if (!isDatabaseConnected()) throw — clear guard, no silent hang
CrawlSession.create({ startUrl, topic, status COMPLETED, config, summary, crawlErrors })
resultDocs = crawl.results.map(page =>
    extractResearch({...page.scraped, url: page.url}) → cleanResearchItem → { session, topic, url, title, source, depth, status, content, extracted })
ResearchResult.insertMany(resultDocs)   // one bulk op, unique index protects
```

- `source` = hostname extracted from the URL (quick "who wrote this?").
- `content` = cleaned paragraph texts (searchable in Phase 7).

### Health endpoint now

```json
{ "status": "ok", "message": "Research Web Crawler & API is running",
  "database": "connected", "timestamp": "..." }
```

## Problems Encountered

### Problem 1 — Mongoose reserved-key warning

### Observation / Error

```
[MONGOOSE] Warning: `errors` is a reserved schema pathname and may break some functionality.
```

### Initially thought

Just a harmless warning.

### Actual cause

Mongoose uses `errors` internally for validation failure maps; shadowing it on
a document can corrupt validation behaviour.

### Solution

Renamed the field to `crawlErrors` (`src/models/CrawlSession.js`), updated
`researchService` and `db-demo`. Re-verified: schema now loads warning-free.

### What I Learned

Reserved-name warnings from a framework are *contract promises made by the
framework*; respecting them avoids mutable, hard-to-trace bugs later.

### Problem 2 — First DB test run appeared to hang

### Observation

The first `db-demo` run stalled on connect; the shell terminated it.

### Initially thought

Mongoose was stuck buffering a query.

### Actual Cause (diagnosis)

First connection to Atlas (TLS + SRV resolve + auth) can exceed a busy session's
patience; later runs connected cleanly, and the commit/read-back completed.

### Solution

Re-ran (worked), and hardened `connectDatabase` with `serverSelectionTimeoutMS`
so any real failure fails fast with a visible error instead of buffering.

### What I Learned

"First-run sluggishness" on cloud services is common — but also *time out
cleanly rather than assume*. The explicitness of connection state is what makes
such diagnosis possible.

## Testing

| Test | Result |
|------|--------|
| Modules import, schema warns? | Loads clean after reserved-key fix |
| `npm run db-demo -- https://example.com` (Atlas) | Connected; session saved `COMPLETED`, 1 page, 0 errors; read-back showed title `Example Domain`, source `example.com`, cleaned `extracted` |
| Persistence across processes | New process, no prior saves in memory → read sessions/results from Atlas: session + 1 result found |
| Multi-page pipeline | `db-demo -- https://www.universal-robots.com` → session + **5 cleaned results** (bulk insert), 43 pages planned, 0 errors |
| Server boot without DB | warning logged, health returns `"database":"disconnected"` (code path unchanged) |

## Result

- [x] MongoDB connection lifecycle (connect / disconnect / status)
- [x] `CrawlSession` schema — metadata, status enum, limits snapshot, summary, errors
- [x] `ResearchResult` schema — typed core + Mixed extraction + indexes + unique page-per-session
- [x] Persist full pipeline output (saveCrawl composes extract + clean)
- [x] Query helpers for Phase 7 (`getCrawlSession(s)`, `getResearchResults`)
- [x] Optional DB in server + health status
- [x] `MONGODB_URI` env (`.env`/`.env.example`)
- [x] Tested against the user's real MongoDB Atlas cluster

## Next Phase

**Phase 7 — Research REST API:** expose crawler + research data through a clean
REST API (`POST/GET /api/crawls`, `GET /api/research`, search/filter/paginate/
sort, validation, proper status codes) — the query helpers from this phase
become the data layer.

---

## Problem Log

| Date | Phase | Problem | Error | Initially thought | Actual cause | Solution | What I learned |
|------|-------|---------|-------|-------------------|--------------|----------|----------------|
| 2026-09-16 | 6 | Schema reserved-key warning | `[MONGOOSE] Warning: 'errors' is a reserved schema pathname` | Harmless warning | Mongoose reserves `errors` for validation failures | Renamed to `crawlErrors` | Framework reserved names are contracts |
| 2026-09-16 | 6 | First Atlas run seemed to hang | stalled connect | Buffered query | Cold TLS/SRV/auth handshake | Re-run; added 5s serverSelectionTimeoutMS | Time out cleanly instead of assuming cloud latency |

## Technical Decision Log

| Decision | Alternatives | Chosen option | Reason | Trade-offs |
|----------|--------------|---------------|--------|------------|
| ODM | raw `mongodb` driver, Prisma | Mongoose | Schemas/validation/indexes; Atlas-native; matches "design carefully" | ODM magic hides low-level mechanics |
| `extracted` storage | fixed fields, string blob | `Schema.Types.Mixed` | Topic-freedom from Phase 4; typed core still validated | No per-field DB validation on extracted data |
| Connection boot behaviour | fail hard on missing DB | optional + warn | Health/demos must work DB-less | Server can run with zero persistence silently |
| Error subdoc field | `errors` | `crawlErrors` | Mongoose reserved name | Slightly awkward name |
| Page uniqueness | nothing | unique index `{session,url}` | No duplicate saves per run | Insert throws on accidental dup (surfaces bugs) |
| Bulk save | one-by-one create | `insertMany` | One round-trip for N pages | Error recovery is coarser |

---

## Notes for Phase 7

- Query helpers already sort (`createdAt`/`crawledAt` desc) and paginate.
- Search across `title`, `content`, `source` will layer on `ResearchResult`.
- Validation (express-validator) and HTTP detail live in routes/controllers/middleware.