# Phase 1 — HTTP & Web Fundamentals

## Objective

Understand how a crawler communicates with websites over HTTP, then build the
smallest useful piece: a service that can fetch a permitted public webpage and
return its HTML. No crawler yet — no queue, no link discovery, no depth limits.
That is Phase 3's job.

## Concepts Learned

### HTTP requests and responses

A browser asks a server for a resource with an **HTTP request**; the server
answers with an **HTTP response**. A response always has:

- a **status code** — `200` success, `301`/`302` redirect, `404` not found, `500` server error…
- **headers** — metadata like `content-type`, `date`, `server`, `content-length`
- a **body** — the actual content (for web pages, HTML)

### URLs

A URL like `https://example.com/about` is made of parts: `https` (protocol),
`example.com` (host), `/about` (path). Node's built-in `URL` class parses them
safely — we used it to blacklist everything except `http:` and `https:`.

### `fetch()` and `async/await`

`fetch()` is Node's modern, built-in way to make HTTP requests (no library
needed). It returns a **Promise**, so we `await` it. Because fetching is slow,
`await` lets the program keep doing other things instead of blocking, then
resumes with the result once it arrives.

```js
const response = await fetch(url, { ... });
```

### Status codes tell us what happened

We captured `response.status` on every result instead of discarding it.
`200` = page found; `404` = missing; `415` = server refused our media type.
The crawler will use status codes to decide whether a page is worth parsing.

### Content types (`Content-Type` header)

`Content-Type: text/html` means HTML; `application/json` means a JSON API. We
flag `isHtml` so callers can skip non-HTML resources.

### Content negotiation (real-world lesson)

The GitHub API answered our `Accept: text/html, application/xhtml+xml` with
**`415 Unsupported Media Type`** because it only serves `application/json`.
The `Accept` header is how a client says what it wants; servers may refuse
what they don't serve. A crawler must accept what the site actually offers.

### Redirects

`fetch(..., { redirect: 'follow' })` follows redirects automatically. We record
`response.url`, the **final** URL after all redirects — critical because the URL
the crawler *started* with may not be the URL the page actually lives at.

### Timeouts with `AbortController`

HTTP can hang forever if a server never answers. `AbortController` gives fetch
a cancel signal: we arm a `setTimeout`, and if the deadline passes we call
`controller.abort()`, which makes the pending `fetch` throw an `AbortError`
that we translate into a friendly `TIMEOUT` error.

### Error handling and typed errors

We created a `FetchError` class with a `kind` field (`INVALID_URL`, `TIMEOUT`,
`NETWORK`, `GENERIC`). Callers can distinguish *why* a fetch failed instead of
guessing from a message string.

## Technology Used

- Node.js built-in `fetch()` — no HTTP library dependency added
- Node built-ins: `URL`, `AbortController`, `setTimeout`
- ES Modules (`import` / `export`)
- Custom `FetchError` class

No new npm packages. This phase deliberately stays native.

## What I Built

- `src/services/webFetcherService.js`
  - `isValidHttpUrl(value)` — absolute-URL check, `http:`/`https:` only
  - `FetchError` — structured failure reason
  - `fetchWebPage(url, { timeoutMs })` — fetches, captures status/headers/content-type, returns `{ url, status, statusText, contentType, isHtml, headers, html }`
- `src/scripts/fetch-demo.js` — CLI harness to run the service against any public URL and print the HTTP details + an HTML preview
- `package.json` — new `npm run fetch-demo` script

## Architecture

```
npm run fetch-demo -- https://example.com
        │ index.html? No:
        ▼
src/scripts/fetch-demo.js        ← CLI: parses args, prints results
        │
        ▼ state moves to the service
src/services/webFetcherService.js ← owns HTTP logic: validation, fetch, timeout
```

The service is separate from the demo script on purpose: the demo is a throwaway
way to **test** the service, while the service is what Phase 3's crawler will import.

## Implementation

### Request flow inside `fetchWebPage`

```
validate URL (http/https)
        ▼
arm AbortController timer (timeout)
        ▼
fetch() → await response
        ▼
capture status, statusText, content-type
        ▼
await response.text()  → HTML body
        ▼
return structured result { url, status, headers, isHtml, html }
```

### Key details

- **Identifier User-Agent** — we send `ResearchWebCrawler/0.1 (+repo URL)`.
  Responsible crawlers say who they are so a site owner can contact us.
  Never impersonate a browser to bypass restrictions.
- **`clearTimeout` in `finally`** — whether the fetch succeeds or fails, the
  timer must be cancelled; otherwise a held timer would keep the process alive.
- **Death by tiny comment** — comments explain *why* (timeouts, protocol guard,
  identifying ourselves), not what each line obviously does.

## Problems Encountered

No code bugs occurred in this phase; the service worked on the first run.
Two worth-recording observations:

### Problem 1 — GitHub API returned 415 Unsupported Media Type

### Cause

`fetchWebPage` sends `Accept: text/html, application/xhtml+xml` because a
crawler wants HTML. The GitHub API only serves JSON and rejects any other
`Accept` value with 415.

### Solution

None needed — it is correct server behaviour. Logged here as a lesson in
**content negotiation**: the client states what it wants via `Accept`, and the
server is free to refuse. The fetcher handled it gracefully (415 + `isHtml: false`
recorded, not a crash).

### What I Learned

Headers are a two-way conversation. A crawler cannot assume every site will hand
over HTML just because we ask; it must handle non-HTML and refusal responses.

### Problem 2 — Windows `npm start` via PowerShell background process

### Cause

Starting `npm` with `Start-Process npm` failed: on Windows npm is `npm.cmd`,
not an `.exe`, and the process launcher could not resolve it.

### Solution

Used `npm.cmd` explicitly (and `node src/server.js` for direct runs).

### What I Learned

Windows executables vs command shims: npm needs `.cmd` when spawned by name.

## Testing

**Method:** real HTTP requests against public test-friendly destinations,
plus a local "server that never answers" to prove the timeout path.

| Test | Command | Result |
|------|---------|--------|
| Success | `npm run fetch-demo -- https://example.com` | `200`, `text/html`, HTML preview shown |
| Invalid URL | `npm run fetch-demo -- not-a-url` | `FetchError INVALID_URL`, exit 1 |
| Wrong protocol | `npm run fetch-demo -- ftp://example.com` | `FetchError INVALID_URL`, exit 1 |
| Missing page | `npm run fetch-demo -- https://example.com/does-not-exist` | `404` reported + skip note |
| Non-HTML media | `npm run fetch-demo -- https://api.github.com/repos/2bigjay/Research-Web-crawler` | `415`, `isHtml: false`, skip note |
| Timeout | local slow server + `--timeout 800` | `FetchError TIMEOUT` after ~800ms, exit 1 |

All six behaviours verified live.

## Result

- [x] Service that fetches a permitted public webpage and returns its HTML
- [x] HTTP status / headers / content-type surfaced on every result
- [x] Redirect-aware final URL
- [x] Configurable timeout via `AbortController`
- [x] Clear error categories (`INVALID_URL`, `TIMEOUT`, `NETWORK`)
- [x] Protocol safety net (`http`/`https` only)
- [x] Honest `User-Agent` identifier
- [x] CLI test harness (`npm run fetch-demo`)
- [x] Phase documentation written

## Next Phase

**Phase 2 — HTML Parsing & Scraping:** feed the retrieved HTML into Cheerio to
extract titles, headings, paragraphs, links, and metadata — and learn the
difference between *crawling* (discovering pages) and *scraping* (extracting
information from a page).

---

## Problem Log

| Date | Phase | Problem | Error | Initially thought | Actual cause | Solution | What I learned |
|------|-------|---------|-------|-------------------|--------------|----------|----------------|
| 2026-09-10 | 1 | GitHub API refused our HTML request | `415 Unsupported Media Type` | Our fetcher was broken | Content negotiation: GitHub only accepts JSON | Handled 415 as a status like any other | Headers are two-way; clients must accept what servers serve |
| 2026-09-10 | 1 | Could not launch `npm` in background on Windows | PowerShell `Start-Process npm` failed | npm was missing | npm is `npm.cmd`, a command shim, not an exe | Use `npm.cmd` / run `node` directly | Windows file-naming matters when spawning processes |

## Technical Decision Log

| Decision | Alternatives | Chosen option | Reason | Trade-offs |
|----------|--------------|---------------|--------|------------|
| HTTP client | axios / node-fetch / got / undici | Native `fetch()` | Built into Node 16+; zero dependency; the modern standard | Less control over some low-level edge cases |
| Timeout mechanism | http.Agent, per-client libs | `AbortController` + `setTimeout` | Native, simple, works with `fetch` | Must remember to `clearTimeout` |
| Error reporting | bare `Error`, string codes | Custom `FetchError` with `kind` | Callers can branch on failure type (needed by the future crawler) | Slightly more boilerplate |
| User-Agent | mimic browser | Identify as `ResearchWebCrawler` | Responsible crawling: say who you are; never hide to bypass blocks | Some strict sites may still block identifiable bots |
| Test harness | test framework (Jest/Vitest) | CLI demo script | Testing framework belongs to a later phase; this teaches manually | Not automated/CI-able yet |