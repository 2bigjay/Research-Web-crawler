# Phase 7 — Research REST API

## Objective

Expose the crawler and the Phase 6 data layer as a clean REST API: start
crawls, list sessions, and list/search/inspect/delete research results — with
request validation, pagination, filtering, sorting, and honest HTTP status
codes. Everything the CLI demos do becomes callable over HTTP.

## Concepts Learned

### Validation as a contract, not a filter

`express-validator` chains live *on the route* and read like a spec: a reader
sees exactly what `POST /api/crawls` accepts (`startUrl` must be an http(s)
URL, `maxPages` 1–50, `requestDelayMs` ≥ 250 …). `validate` then runs them and
turns failures into a consistent `400` shape. Validation is also a **safety
cap**: the API can't be used to hammer a site (max 50 pages, min 250 ms delay —
those ceilings exist to protect targets, not to be polite to us).

### The `toInt()` illusion

Sanitizer chains like `.toInt()` mutate the *validated copy*, not `req.query`.
Controllers must coerce anyway (`Number(req.query.limit) || 20`). Catching this
kept the echoed pagination honest (`"5"` vs `5`).

### ObjectId is a real type

A *malformed* id (`/api/research/123`) is a `400`; a *well-formed nonexistent*
id is a `404`. The error middleware translates mongoose `CastError` → `400`
instead of leaking a 500.

### Order matters in routers

`/api/research/search` must be declared before `/api/research/:id`, or Express
matches `:id` → "search" → CastError. Route order is part of the API design.

### Controllers stay thin

Crawling + persistence logic lives in services (Phases 3/6). Controllers only
parse, call services, and shape responses. This keeps HTTP details out of
business logic and vice versa.

### DNS is a deployment concern (the interesting bug)

Atlas URIs need DNS SRV lookups. On this machine Node's resolver silently
failed with `querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net` while
`nslookup` succeeded — a Windows resolver quirk. The fix is opt-in via env:
`DNS_SERVERS=8.8.8.8,1.1.1.1` switches Node's resolver. It's config, not
hardcoded DNS in code.

## Technology Used

- **express-validator** (added) — declarative per-route validation.
  - *Why:* the standard Express-native validator; chains read as specs.
  - *Alternatives:* joi / zod (independent schemas decoupled from routes),
    hand-rolled checks (no central error shape).
  - *Trade-offs:* chains live in routes (fine here); a dedicated schema lib
    would pay off with a bigger surface.

## What I Built

- `src/routes/crawlerRoutes.js` — `POST /api/crawls`, `GET /api/crawls`, `GET /api/crawls/:id` + validation spec
- `src/routes/researchRoutes.js` — `GET /api/research`, `GET /api/research/search`, `GET/DELETE /api/research/:id` + validation spec
- `src/controllers/crawlerController.js` — start/list/get crawl with results
- `src/controllers/researchController.js` — list (filters+sort), search, get, delete
- `src/middlewares/validationMiddleware.js` — runs chains → 400 `{ errors: [{field,value,message}] }`
- `src/middlewares/errorMiddleware.js` — 404 + central handler (CastError → 400, duplicate key → 409, DB-down → 503, else 500); moved out of server.js
- `src/services/researchService.js` — added `{data,total}` pagination, `getResearchResult`, `deleteResearchResult`, `searchResearchResults` (regex-escaped, `$or` over title/source/url/content)
- `src/config/database.js` — dotenv self-loading + optional `DNS_SERVERS` override
- `src/server.js` — mounts routers, registers extractors, uses error middleware

## Endpoints

| Method | Path | Purpose | Success | Errors |
|--------|------|---------|---------|--------|
| POST | `/api/crawls` | run + persist a crawl synchronously | 201 | 400 (validation), 503 (no DB) |
| GET | `/api/crawls?limit&skip` | list sessions, newest first | 200 | 400 |
| GET | `/api/crawls/:id` | one session + its results | 200 | 400/404 |
| GET | `/api/research?topic&session&source&sort&order&limit&skip` | filtered + sorted list | 200 | 400 |
| GET | `/api/research/search?q&limit&skip` | free-text search | 200 | 400 |
| GET | `/api/research/:id` | one result | 200 | 400/404 |
| DELETE | `/api/research/:id` | remove a result | 204 | 400/404 |

`POST /api/crawls` body: `{ startUrl (required), topic, maxPages, maxDepth,
requestDelayMs, timeoutMs }` — topic defaults `robotics-companies`, must be
registered; limits are bounded (pages 1–50, depth 0–3, delay 250–60000,
timeout 1000–120000).

Pagination response envelope: `{ success, data, total, limit, skip }`.

## Implementation

### Validation spec (example: POST /api/crawls)

```
body('startUrl') .trim().notEmpty().bail().isURL({ protocols:['http','https'], require_protocol:true })
body('topic')    .optional({values:'falsy'}).isIn(getTopics())
body('maxPages') .optional({values:'falsy'}).isInt({min:1,max:50}).toInt()
... requestDelayMs, timeoutMs bounded ...
```

`validate` → `400 { success:false, message:'Validation failed', errors:[{field,value,message}] }`.

### Error mapping

| Condition | Status |
|-----------|--------|
| validation rule failed | 400 |
| malformed ObjectId (CastError) | 400 |
| mongoose ValidationError | 400 |
| duplicate unique key (code 11000) | 409 |
| saveCrawl's "Database not connected" | 503 |
| unknown / other | 500 |

### Search

`q` is regex-escaped (user input can't inject regex), matched case-insensitively
across `title`, `source`, `url`, `content[]` via `$or`.

## Problems Encountered

### Problem 1 — Server never connected; queries buffered and timed out

### Observation

Health said `"database":"disconnected"`, POST crawl returned 503, then list
queries hit `Operation ... buffering timed out after 10000ms`.

### Initially thought

The server's async connect was racing the first request; dotenv wasn't loaded.

### Actual cause

Two compounding issues:

1. `getMongoUri()` read `process.env.MONGODB_URI`, but only `server.js` loaded
   dotenv — the CLI scripts got their URI only because an ambient env variable
   happened to be set during earlier runs. Not deterministic.
2. The real blocker: Atlas SRV lookup failed — `querySrv ECONNREFUSED
   _mongodb._tcp.cluster0.vttqvn8.mongodb.net`. `nslookup` answered fine; Node's
   in-process resolver did not (Windows resolver quirk). This failure was also
   being masked, so the server looked "fine but idle".

### Solution

- `database.js` now calls `dotenv.config()` itself → any DB consumer sees the
  same URI deterministically.
- Added opt-in `DNS_SERVERS=8.8.8.8,1.1.1.1` → `dns.setServers()` before
  connecting; connection restored (~1.8s to Atlas).
- Probes proved each hypothesis: a standalone connect test failed fast with the
  SRV error; forcing public DNS connected instantly.

### What I Learned

Silence looks like "working". A wall of buffering timeouts only appeared *after*
I'd already misdiagnosed as a race. `connectDatabase()` failing fast with a
visible error (it does now via serverSelectionTimeoutMS) is worth more than
convenience.

### Problem 2 — Validation passes yet `limit` echoes as a string

### Observation

`GET /api/crawls?limit=5` returned `"limit":"5"`.

### Initially thought

`.toInt()` sanitizes `req.query`.

### Actual cause

Sanitizers transform the validated copy; `req.query` still holds strings.

### Solution

Controllers coerce: `Number(req.query.limit) || 20`. Verified `limit` now echoes
as a number.

### What I Learned

Validation returning 400 is not the same as normalization applying downstream.

## Testing

| Test | Result |
|------|--------|
| `GET /api/health` | 200, `database` transitions connecting → connected |
| `POST /api/crawls {"startUrl":"not-a-url"}` | 400 validation |
| `POST /api/crawls topic=nope` | 400 validation |
| `POST /api/crawls example.com` | 201, session COMPLETED + resultsCount 1 (persisted) |
| `GET /api/crawls?limit=5&skip=1` | 200, numbers echo as ints, total correct |
| `GET /api/crawls/:id` missing | 404 |
| `GET /api/crawls/notanid` | 400 (CastError) |
| `GET /api/research?limit&sort=depth` | 200 filtered/sorted envelope |
| `GET /api/research/search?q=example` | 200 matches; missing `q` → 400 |
| `GET /api/research/:id` | 200; malformed → 400; unknown → 404 |
| `DELETE /api/research/:id` | 204 then 404 on repeat |
| `GET /api/nope` | 404 JSON |
| zero unhandled log lines across every run | ✅ stderr clean |

## Result

- [x] REST surface: 7 endpoints across crawls + research
- [x] Declarative validation specs returning consistent 400s
- [x] Pagination envelope `{success, data, total, limit, skip}`
- [x] Filters (`topic`, `session`, `source`), whitelisted sort + order
- [x] Free-text search with regex-escaped input
- [x] Error middleware: 400 CastError, 409 duplicates, 503 DB-down, 404, 500
- [x] DB-down doesn't crash the server (deterministic env loading + fast fail)
- [x] Full endpoint sweep passed, stderr clean

## Next Phase

**Phase 8 — Bulletproofing & Security:** request-rate limiting, auth/api-keys, limiting,
basic auth/keys, CORS, header hygiene, input hardening (the API is now a real
attack surface).

---

## Problem Log

| Date | Phase | Problem | Error | Initially thought | Actual cause | Solution | What I learned |
|------|-------|---------|-------|-------------------|--------------|----------|----------------|
| 2026-09-16 | 7 | Server DB never connected | buffering timeouts; 503 | async connect race | dotenv not deterministic + Atlas SRV refused by Node's resolver | dotenv in database.js; `DNS_SERVERS` env override | Silence looks like working; fail fast with visible errors |
| 2026-09-16 | 7 | `limit` echoed as string | `"limit":"5"` | `.toInt()` sanitizes req | sanitizers mutate validated copy | `Number(req.query.limit)||20` | 400 ≠ normalization |

## Technical Decision Log

| Decision | Alternatives | Chosen option | Reason | Trade-offs |
|----------|--------------|---------------|--------|------------|
| Validator | joi/zod schemas, hand-rolled | express-validator | Express-native, specs read inline on routes | chains live scattered in routes |
| Env loading | every script configures itself | `dotenv.config()` inside database.js | single deterministic source for DB URI | config call in a config module (fine) |
| DNS override | hardcoded `setServers`, OS-level change | env var `DNS_SERVERS` | opt-in, deployable, no hardcode | needs one extra env line on affected networks |
| Error map | always 500 | CastError→400, 11000→409, DB→503 | clients can react honestly | middleware grows with each case |
| Sync POST crawl | background queue (later phase) | synchronous 201 on completion | simple, honest for v1 | long requests (~pages×delay) — Phase 9 moves to jobs |

---

## Notes for Phase 8

- Rate limiting will wrap `/api/crawls` specifically (expensive, outbound traffic).
- Auth for POST/DELETE vs public GET decide.
- CORS + header hardening fit the error middleware family.