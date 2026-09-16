# Phase 8 — Security & Responsible Crawling

## Objective

The Phase 7 API is a real attack surface: anyone can spend the server's
outbound politeness budget, flood it, or scrape it. This phase hardens it —
rate limiting (the *responsible* part), security headers, a CORS policy, and
opt-in API-key auth for write endpoints — while keeping development friction
at zero and reads public.

## Concepts Learned

### Rate limiting is castable to the API shape

`express-rate-limit` counts per IP in memory. Two tiers: a generous global
`/api` budget for list/search (read traffic), and a tight one for
`POST /api/crawls` — because a crawl *is* outbound traffic on the caller's
behalf. 10 crawls/minute/caller is plenty for research and caps what an abusive
caller can make us do to a target site. Rate limiting is what makes "we only
crawl responsibly" a property enforced in code, not a promise.

### Health checks belong outside the limiter

If `/api/health` is throttled, a monitoring probe can't tell "API healthy" from
"API under load" — and worse, the probe's own retries get quietly dropped.
Health stays unlimited; everything else under `/api` is limited.

### Headers: buy the battle-tested defaults

`helmet` sets a coherent, well-reviewed header baseline (CSP, nosniff, HSTS,
referrer-policy, …). Rolling our own is a security anti-pattern. CORS is
orthogonal: headers protect browsers' *responses*; CORS controls which *origins*
may read them. Both need explicit, env-driven configuration.

### Authorization is a per-route middleware

Auth should run *inside the route definition*, right next to validation — mount
everything under `/api` with auth and GET endpoints get locked down too; mount
it against a parent path and it's easy to misapply. The clean design reads in
the route file: `router.post('/', requireApiKey, [validation...], controller)`.
The key mechanism is deliberately plain (compare `x-api-key` to `API_KEY` env)
and **opt-in**: unset `API_KEY` = previous behaviour, zero migration cost.

### Security config is reportable

The health endpoint exposes current `security` state (`rateLimits`, `cors`,
`auth`) so you can verify what's actually running — parity with the existing
`database` state reporting. Config you can't observe degrades silently.

## Technology Used

- **helmet** (added) — hardened default HTTP headers.
- **cors** (added) — CORS middleware with env-driven origin list.
- **express-rate-limit** (added) — per-IP request budgets with in-memory store.
  - *Alternatives:* `rate-limiter-flexible` (supports Redis, more knobs),
    proxy-level limiting (nginx). In-memory is right for a single-instance
    project; swap for a shared store when scaling.
  - *Used via env:* `RATE_LIMIT_MAX`, `CRAWL_RATE_LIMIT_MAX`, `CORS_ORIGINS`,
    `API_KEY`.

## What I Built

- `src/middlewares/rateLimiters.js` — `apiLimiter` (120/min per IP) +
  `crawlLimiter` (10/min), JSON error body, `limiterStateText()`
- `src/middlewares/securityMiddleware.js` — `securityHeaders` (helmet),
  `corsPolicy` (env `CORS_ORIGINS`, default `*`), `securityStateText()`
- `src/middlewares/authMiddleware.js` — `requireApiKey` (opt-in, `x-api-key`
  vs `API_KEY` env, 401 otherwise), `authStateText()`
- `server.js` — wires all layers; health reports the `security` block
- `routes/crawlerRoutes.js` — `requireApiKey` on `POST /api/crawls`
- `routes/researchRoutes.js` — `requireApiKey` on `DELETE /api/research/:id`
- `.env.example` — documents the new security variables

## Request Pipeline (now)

```
request
  ├─ express.json()
  ├─ disable x-powered-by
  ├─ helmet            (security headers)
  ├─ cors              (origin policy)
  ├─ /api/health       — unlimited (monitoring probes)
  ├─ /api/crawls       — apiLimiter(120/min) → crawlLimiter(10/min)
  │                       → requireApiKey → validation → controller
  └─ /api/research     — apiLimiter(120/min)
                          → GET open; DELETE → requireApiKey → validation
```

Health response now includes:

```json
"security": {
  "rateLimits": "api=120/min, crawls=10/min",
  "cors": "corsOrigins=*",
  "auth": "disabled (open)"   // "api-key required (writes)" when API_KEY set
}
```

## Problems Encountered

### Problem 1 — Auth applied to a whole mount guards GETs too

### Observation

First wiring did `app.use('/api/crawls', requireApiKey, crawlerRoutes)`.

### Initially thought

"All crawls routes need the key" — wrong, crawls *reads* (list/session) are
public research reads like the rest of GET.

### Actual cause

Mount-level middleware can't distinguish which route within the router it runs
for. A second, deliberately narrow mount on `/api/research/:id` was also a trap:
Express answers from the first matching mount, so a second mount with the
auth middleware would never even run for DELETE (the first mount's router
already handled it auth-free).

### Solution

Applied `requireApiKey` per-route, exactly where it belongs (next to its
validation): `POST /api/crawls` and `DELETE /api/research/:id` only.

### What I Learned

Route-order and mount semantics ARE security semantics. A bypass hiding in
"who is mounted first" is exactly the kind of bug a code review should catch.

## Testing

| Test | Result |
|------|--------|
| Armour lines: `x-powered-by` stripped | PASS |
| helmet `X-Content-Type-Options: nosniff` | PASS |
| health reports `security` block (auth + limits + CORS) | 200 |
| GET `/api/research` (public) | 200 |
| 4 rapid `POST /api/crawls` (limit 3/min override) | `201, 201, 201, 429` |
| health while throttling | still 200 |
| `POST /api/crawls` without/with wrong key (auth on) | 401 / 401 |
| `POST /api/crawls` with key (limit 10/min override) | 201 (real run persisted) |
| GET research while auth enabled | 200 (reads open) |
| `DELETE /api/research/:id` without key | 401 |
| `DELETE` with key, nonexistent id | 404 (proves auth passed) |
| stderr across both runs | empty |

## Result

- [x] Global + crawl-specific rate limits (env-tunable, in-memory now)
- [x] Helmet security headers; `X-Powered-By` removed
- [x] CORS origin policy from env (default `*` for dev)
- [x] Opt-in API-key auth exactly on write endpoints; reads stay public
- [x] Health endpoint unaffected by throttling and reports security state
- [x] All behaviours verified in two server runs (open + locked)

## Next Phase

**Phase 9 — Automation & Scheduling:** run crawls on a schedule (node-cron),
background job queue for long crawls, scheduled/summarized research reports —
the API currently still crawls synchronously inside the request.

---

## Problem Log

| Date | Phase | Problem | Error | Initially thought | Actual cause | Solution | What I learned |
|------|-------|---------|-------|-------------------|--------------|----------|----------------|
| 2026-09-16 | 8 | Auth misapplied to reads / would-be bypass | n/a (design review) | mount-level `requireApiKey` protects only writes | mount-level middleware can't see inner route; 2nd mount never runs | per-route `requireApiKey` next to validation | Mount order is security semantics |

## Technical Decision Log

| Decision | Alternatives | Chosen option | Reason | Trade-offs |
|----------|--------------|---------------|--------|------------|
| Rate-limit store | Redis-backed, proxy/nginx | express-rate-limit in-memory | right for single instance | resets on restart; N instances double budgets |
| Health throttling | limit everything | exclude /api/health | probes must always work | probes can't be throttled to protect the box |
| Auth mechanism | full user/password, JWT | plain API key | fits single-administrator API; opt-in | no rotation/expiry (fine here) |
| Auth scope | all routes | write routes only | research reads stay public | writes are the expensive/risky surface — covered |
| Security headers | hand-rolled | helmet | maintained defaults | little control granularity (unneeded) |
| Health security block | debug log only | report in health | observable config | slightly noisier health JSON |

---

## Notes for Phase 9

- Scheduled crawls should use the same `saveCrawl` pipeline (already exists).
- A job queue would stop the 10/min-limit being spent on HTTP-held requests.