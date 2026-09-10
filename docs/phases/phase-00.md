# Phase 0 — Project Foundation

## Objective

Create the initial backend project and establish a clean, documented foundation:
an npm package, a minimal Express server, environment-variable handling, a health
check endpoint, Git, and starting documentation.

Nothing crawler-related yet. Phase 0 is deliberately small so the base is solid
before real functionality is added.

## Concepts Learned

- **npm project anatomy** — why `package.json` exists, what "dependencies" vs "devDependencies" mean, and what `"type": "module"` does (enables ES `import` syntax).
- **Express app structure** — how middleware and routes are registered in order, and why order matters (404 handler must come after all real routes).
- **Middleware order** — a middleware runs for every request that reaches it; the 404 and error handlers only make sense at the end of the chain.
- **4-parameter error handler** — Express identifies an error-handling middleware by its 4 parameters `(err, req, res, next)`.
- **Environment variables** — keeping configuration (like the port) out of the source code via `.env` + `dotenv`, and why `.env` is gitignored while `.env.example` is committed.
- **Health checks** — why APIs expose a lightweight endpoint that tells monitoring tools "I am alive".

## Technology Used

- Node.js (v24 in development; engines >= 18)
- Express 5
- dotenv
- npm
- Git

No other dependencies were added. Development auto-restart uses Node's built-in
`node --watch` instead of a package like nodemon.

## What I Built

- `src/server.js` — Express server with:
  - `GET /api/health` → JSON status response
  - JSON body parsing (ready for future POST requests)
  - Catch-all 404 handler returning JSON
  - Central error handler returning JSON
- `package.json` — project metadata and `start` / `dev` scripts.
- `.env` + `.env.example` — `PORT` configuration.
- `.gitignore` — ignores `node_modules/`, `.env`, logs, OS/editor files.
- `README.md` — project overview, roadmap, run instructions.
- `docs/phases/phase-00.md` — this document.

## Architecture

Phase 0 uses the smallest possible layout. Everything lives in one server file
because that is all the phase needs. As later phases add controllers, services,
models, and middleware, they get their own folders so responsibilities stay separated.

```
research-crawler/
├── src/
│   └── server.js
├── docs/
│   └── phases/
│       └── phase-00.md
├── .env
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Implementation

### Request flow

```
Browser / Postman / curl
        │  GET /api/health
        ▼
  express.json() middleware   →  parses JSON body if present
        │
        ▼
  GET /api/health route       →  returns { status: "ok", ... }
        │
        ▼
  (no match?) 404 handler     →  returns { success: false, ... }
        │
        ▼
  (error thrown?) error handler →  returns 500 JSON
```

### Key details

- **`dotenv.config()` runs before anything reads `process.env`.** The port is read
  only after dotenv has loaded `.env`, so `PORT` is picked up correctly. Load order
  here matters.
- **`node --watch`** in the `dev` script restarts the server on file changes without
  adding nodemon as a dependency.
- **404 and error handlers are registered last** — Express calls middleware in the
  order it was registered, so anything registered after them would never be reached.

## Problems Encountered

No blocking problems occurred in this phase. Two notes for the log:

### Problem 1 — Port availability

### Cause

The earlier `staff_Management` project also listens on a fixed port. If a server is
already using the chosen port, Express throws `EADDRINUSE` and crashes on startup.

### Solution

Used a port different from the other project (`4000`). If `EADDRINUSE` appears,
either stop the conflicting process or change `PORT` in `.env`.

### What I Learned

Ports are global to a machine, not to a project. Two Node processes cannot listen on
the same port at the same time.

## Testing

**Method:** start the server, hit the endpoints, verify responses.

1. Start: `npm run dev`
2. Health check: `GET http://localhost:4000/api/health`
3. Unknown route 404: `GET http://localhost:4000/does-not-exist`

**Observed results:**

| Request | Result |
|---------|--------|
| `GET http://localhost:4000/api/health` | `200` · `{"status":"ok","message":"Research Web Crawler & API is running","timestamp":"2026-09-10T00:23:41.841Z"}` |
| `GET http://localhost:4000/does-not-exist` | `404` · `{"success":false,"message":"Route not found: GET /does-not-exist"}` |

Also observed during startup: `Research Web Crawler & API listening on http://localhost:4000`.
The health endpoint returns `200`; unknown routes return a JSON `404`. Both confirmed.

## Result

- [x] npm project initialized
- [x] Express server configured
- [x] `GET /api/health` returns JSON
- [x] Environment variables configured via `.env`
- [x] `.gitignore` added
- [x] `.env.example` added
- [x] README created
- [x] Git repository initialized
- [x] Initial commit made

## Next Phase

**Phase 1 — HTTP & Web Fundamentals:** build a service that can request a permitted
public webpage and retrieve its HTML using Node's native `fetch()`, learning HTTP
requests/responses, status codes, and timeouts along the way.

---

## Problem Log

| Date | Phase | Problem | Error | Initially thought | Actual cause | Solution | What I learned |
|------|-------|---------|-------|-------------------|--------------|----------|----------------|
| 2026-09-10 | 0 | Port conflict with another project | `EADDRINUSE` (anticipated) | Random crash | The port was already in use on the machine | Chose a free port (`4000`) | Ports are machine-global, not project-global |

## Technical Decision Log

| Decision | Alternatives | Chosen option | Reason | Trade-offs |
|----------|--------------|---------------|--------|------------|
| Module system | CommonJS (`require`) | ES Modules (`"type": "module"`) | Modern Node standard; cleaner `import` syntax; matches Node 24 support | Some older tooling expects CommonJS |
| Dev auto-restart | nodemon | `node --watch` | Zero extra dependency; built into Node 18.11+ | `--watch` has fewer options than nodemon |
| Phase 0 dependencies | Only ones strictly needed | `express`, `dotenv` | Phase 0 needs a server and env loading; nothing else yet | Will need more later, added when required |
| Project location | Inside `staff_Management` | New sibling `research-crawler/` folder | Separate, independent project; independent Git history | — |