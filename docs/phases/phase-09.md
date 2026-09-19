# Phase 9 — Automation & Background Crawling

## Objective

Phase 7's API crawled **inside the HTTP request** — the request stayed open for
`pagesCount × requestDelayMs`. This phase breaks that coupling: crawls now run
in a **background job queue**, `POST /api/crawls` returns `202 Accepted` in
milliseconds, and a **node-cron scheduler** (Phase 9 requirement:
"node-cron — work with programming languages and cron expression syntax") can
kick off re-research on a schedule without any HTTP call at all.

Result: the crawl session is persisted **immediately as RUNNING** (so a failed
box still leaves an audit trail), the crawl runs off to the side, and the
client polls `GET /api/crawls/:id` until it flips to COMPLETED.

## Concepts Learned

### Background work = durable request → short response

Kill the message that "a crawl takes N×delay seconds" and the API becomes
responsive regardless of how long a crawl runs. The queue makes the *request*
fast (202); the *crawl* stays slow with full politeness.

### A queue is concurrency 1, by design

The job worker executes **one crawl at a time** (sequential). Two crawls in
parallel would double the load we send a single site — the opposite of
Phase 8's responsible-crawling story. Sequential + global `requestDelayMs`
pacing is politeness enforced by architecture.

### The session is the durable unit; the job is ephemeral

- `CrawlSession` (Mongo) is the source of truth: RUNNING → COMPLETED/FAILED,
  persists across restarts.
- `Job` (in-memory `Map`) is the execution handle: QUEUED → RUNNING →
  COMPLETED/FAILED. It survives only the process lifetime. If the server dies
  mid-Job, the session is already RUNNING in Mongo — a re-run or a manual
  cleanup tool reconciles.

### Scheduler ≠ queue

- **Queue** (`jobQueue.js`): *how* work runs — FIFO + one-at-a-time worker.
- **Scheduler** (`schedulerService.js`): *when* work runs — a `node-cron`
  expression evaluated against the clock.
Phase 9 mounts the scheduler *on top of* the queue: the scheduler, when
enabled, simply enqueues scheduled crawl jobs through the same worker. One
worker, one politeness budget, two ways to feed it.

### node-cron validates the cron expression at boot

Calling `cron.schedule(expr, task)` with a malformed expression throws
immediately (`Invalid cron expression`), not at first tick. That moves a
"works yesterday, silent today" class of bugs to boot-time, where they're
loud.

## Technology Used

- **node-cron** (added): TTL-out-of-the-box cron parsing + `ScheduledTask`
  handle (`.getStatus()`, `.stop()`, `.destroy()`).
  - *Alternatives:* `cron` (leaner, ~5× smaller; does not ship
    human-readable minute-range helpers), `later`, OS-level `crontab`/
    Windows Task Scheduler (not portable inside a Node app), a hand-rolled
    `setTimeout` loop (re-invents cron math + DST handling — wrong).
  - *Trade-offs:* node-cron is the tutorial-stated choice and the most
    beginner-documented; its dependency surface is bigger than `cron`'s but
    the API contract (`.getStatus()`) is what Phase 9's job reporting uses.

## Built

- `src/services/jobQueue.js` — deterministic in-memory job queue: `enqueueCrawlJob`,
  bounded list, `pump()` sequential worker, status transitions. Exported:
  `listJobs`, `getJob`, `enqueueCrawlJob`, `jobQueueStateText`.
- `src/services/schedulerService.js` — env-or-scheduler config (`CRAWL_SCHEDULE`,
  `SCHEDULED_START_URLS`, `SCHEDULED_TOPIC`, `SCHEDULED_MAX_PAGES`), `node-cron`
  registration via `startScheduler()`, and `runScheduledCrawls()` (exported so
  it's testable without waiting for a cron tick). `schedulerStateText()` feeds
  the health endpoint.
- `src/controllers/crawlerController.js` — `POST /api/crawls` now branches:
  `sync:false` (default) → 202 + queued job; `sync:true` → 201 + completed
  run inline. Plus `GET /api/crawls/:id` (polling) and job-status handlers.
- `src/models/CrawlSession.js` — `runType: manual|scheduled|sync` + `failure`
  field (Phase 6 model data, now the async state machine).
- `src/routes/crawlerRoutes.js` — `POST /`, `GET /:id`, job endpoints.
- `src/server.js` — `connectDatabase()` triggers `startScheduler()`; health
  reports `automation: { scheduler: {...} }`.
- `src/scripts/jobs-demo.js` — CLI: start a crawl, poll it to completion,
  inspect the job. `npm run jobs-demo -- https://example.com`
- `src/config/database.js` — dotenv+vars loading source (Phase 9 keeps it the
  single place env is read from).

## Architecture

```
POST /api/crawls { sync:false }
        │  202 { sessionId, jobId }        (status: RUNNING, persisted NOW)
        ▼
   jobQueue.enqueueCrawlJob()              QUEUED
        ▼ worker (single sequential pump)
   RUNNING → crawlWeb() → saveCrawl() → completeCrawlSession()
        ▼
   COMPLETED   ← GET /api/crawls/:id polls here

schedulerService (node-cron "0 2 * * *")
        │  on tick: build session + enqueue through the SAME jobQueue
        ▼
   scheduled crawl re-runs research nightly, no HTTP involved
```

### API

```
POST /api/crawls { startUrl, topic, config..., sync? }
   sync=false (default) → 202 { data: session(RUNNING), jobId }
   sync=true            → 201 { data: session(COMPLETED) }
GET  /api/crawls/:id    → poll: RUNNING → COMPLETED { summary, crawlErrors }
GET  /api/jobs          → in-memory queue: [ { id, sessionId, status, ... } ]
GET  /api/jobs/:id      → one job, or 404 + hint that the registry is in-memory
```

### Health

```json
"automation": {
  "scheduler": { "enabled": true, "schedule": "0 2 * * *",
                 "urls": [ "https://..." ], "topic": "robotics-companies",
                 "maxPages": 10, "lastRun": "...", "nextRun": "..." }
}
```

`scheduler.enabled` is true only when **both** `CRAWL_SCHEDULE` **and**
`SCHEDULED_START_URLS` are set. `nextRun` comes from `task.getStatus().nextDate`.

## Testing

| Test | Result |
|------|--------|
| `node --check` across server/controller/routes/services | PASS |
| `POST /api/crawls` sync:false → 202, session status `RUNNING` | PASS |
| poll `GET /api/crawls/:id` → RUNNING → `COMPLETED`, results persisted | PASS |
| `POST /api/crawls` sync:true → 201, session `COMPLETED` inline | PASS |
| `GET /api/jobs` / `GET /api/jobs/:id` → job moves QUEUED→COMPLETED | PASS |
| `/api/research?limit=1` read-back of persisted results | PASS |
| `runScheduledCrawls()` direct call → scheduled sessions created | PASS |
| stderr during full run | empty |

## Result

- [x] Async (202) background crawls; sync (201) fallback preserved
- [x] Sequential single-worker politeness queue
- [x] node-cron scheduled re-research (opt-in via env)
- [x] Job status endpoints (in-memory, documented as such)
- [x] Health exposes scheduler state incl. `nextRun`
- [x] `runType` persists on sessions for querying/filtering

## Notes for Phase 10

- In-memory jobs mean "JobId not found after restart" — the DB session is the
  reconciliation point. A Phase 10+ improvement: persist job metadata on the
  session document.
- The workspace/queue is single-process. Multi-instance (Phase 12) would need
  a shared queue (Redis/bull). The tutorial phase list stops at Phase 9 for
  automation per the spec review; check `CRAWL_SCHEDULE="*/10 * * * *"` for
  a quick smoke run rather than a long nightly.
