# Research Web Crawler & API

A responsible web crawler & research API built with **Node.js**, **JavaScript**, and **Express**.

The system will eventually accept research requests, crawl permitted public websites,
extract and clean useful information, store results in MongoDB, expose them through a
REST API, and (later) summarize them with AI.

This is both a **real software project** and a **learning project**, developed
phase-by-phase and documented publicly.

> **Important:** This project only crawls permitted public content. It never attempts to
> bypass CAPTCHAs, authentication, paywalls, anti-bot protections, or any access
> restriction. Crawl limits and rate control are part of the architecture, not an afterthought.

---

## Current Status

**Phase 6 — Database** (done)

Everything now persists: `CrawlSession` + `ResearchResult` schemas in Mongo
(Mongoose), authenticated against MongoDB Atlas. The server runs DB-less too —
with the `database` state surfaced in `/api/health`.

Each phase is documented under [`docs/phases/`](docs/phases/).

| # | Phase | Status |
|---|-------|--------|
| 0 | Project Foundation | ✅ Done |
| 1 | HTTP & Web Fundamentals | ✅ Done |
| 2 | HTML Parsing & Scraping | ✅ Done |
| 3 | Crawler Engine | ✅ Done |
| 4 | Research Extraction Engine | ✅ Done |
| 5 | Data Processing & Cleaning | ✅ Done |
| 6 | Database | ✅ Done |
| 2 | HTML Parsing & Scraping | ⬜ Pending |
| 3 | Crawler Engine | ⬜ Pending |
| 4 | Research Extraction Engine | ⬜ Pending |
| 5 | Data Processing & Cleaning | ⬜ Pending |
| 6 | Database | ⬜ Pending |
| 7 | Research REST API | ⬜ Pending |
| 8 | Security & Responsible Crawling | ⬜ Pending |
| 9 | Automation | ⬜ Pending |
| 10 | AI Research Assistant | ⬜ Pending |
| 11 | Frontend | ⬜ Pending |
| 12 | Deployment | ⬜ Pending |
| 13 | Polish & Portfolio | ⬜ Pending |

---

## Tech Stack

- **Runtime:** Node.js (>= 18)
- **Language:** JavaScript (ES Modules)
- **Framework:** Express
- **Environment:** dotenv
- **Database:** MongoDB Atlas + Mongoose _(Phase 6)_
- **Scraping:** Cheerio _(Phase 2)_
- **Scheduling:** node-cron _(Phase 9)_
- **Frontend:** React + Vite _(Phase 11)_

---

## Getting Started

### Prerequisites

- Node.js 18 or newer (`node --version`)

### Install

```bash
npm install
```

### Run locally (development)

```bash
npm run dev
```

This uses Node's built-in `--watch` mode: the server restarts automatically when you
edit a file.

### Run in production style

```bash
npm start
```

### Environment variables

Copy the example file and adjust values:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port the API listens on | `4000` |
| `MONGODB_URI` | MongoDB connection string (Atlas `mongodb+srv://` or localhost) | unset → no persistence |
| `CRAWL_MAX_PAGES` | Maximum pages per crawl | `20` |
| `CRAWL_MAX_DEPTH` | Maximum link depth per crawl | `2` |
| `CRAWL_DELAY_MS` | Politeness delay between requests | `1000` |
| `CRAWL_TIMEOUT_MS` | Per-request timeout | `10000` |

### Fetch a page (Phase 1 demo)

Fetch any permitted public webpage and inspect its HTTP details (status,
headers, content type, HTML preview):

```bash
npm run fetch-demo -- https://example.com
npm run fetch-demo -- https://example.com --timeout 5000   # custom timeout (ms)
```

### Scrape a page (Phase 2 demo)

Fetch a permitted public page and print its scraped structure (title, headings,
paragraphs, links, metadata):

```bash
npm run scrape-demo -- https://example.com
```

### Crawl a site (Phase 3 demo)

Crawl a permitted public site with safety limits, printing a crawl summary
(queue, depth, dedupe, errors):

```bash
npm run crawl-demo -- https://books.toscrape.com --max-pages 9 --delay 300
```

Defaults come from `.env` (`CRAWL_MAX_PAGES=20`, `CRAWL_MAX_DEPTH=2`, ...); flags
override them per run.

### Research extraction (Phase 4 demo)

Crawl a site and turn each page into a structured research item:

```bash
npm run extract-demo -- https://www.universal-robots.com --topic robotics-companies
```

Registered topics: `robotics-companies` (more added per topic in later phases).

### Clean & dedupe (Phase 5 demo)

Crawl → drop duplicate pages → extract → clean each research item, showing the
differences (entities, whitespace, empties, duplicate values/URLs repaired):

```bash
npm run clean-demo -- https://books.toscrape.com --max-pages 8
```

### Save a crawl to MongoDB (Phase 6 demo)

Runs a small crawl, persists the session + cleaned research results to MongoDB,
then reads them back:

```bash
npm run db-demo -- https://example.com
npm run db-demo -- https://www.universal-robots.com --topic robotics-companies
```

Requires `MONGODB_URI` in `.env` (Atlas or local MongoDB).

---

## API Endpoints

### Health check

```
GET /api/health
```

Response:

```json
{
  "status": "ok",
  "message": "Research Web Crawler & API is running",
  "database": "connected",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

---

## Project Structure

```
research-crawler/
├── src/
│   ├── server.js             # Express server entry point (+ optional DB connect)
│   ├── config/
│   │   └── database.js       # Phase 6: mongoose connect/disconnect/status
│   ├── services/
│   │   ├── webFetcherService.js  # Phase 1: fetch + timeout + HTTP metadata
│   │   ├── scraperService.js     # Phase 2/4: Cheerio HTML → structured data
│   │   ├── crawlerService.js     # Phase 3: queue, visited set, depth/page caps
│   │   ├── extractionService.js  # Phase 4: topic registry + extractResearch()
│   │   ├── cleaningService.js    # Phase 5: clean items + dedupe pages
│   │   ├── researchService.js    # Phase 6: save/query sessions + results
│   │   └── extractors/
│   │       ├── index.js          # Phase 4: registers built-in extractors
│   │       └── roboticsCompanies.js  # Phase 4: research topic #1
│   ├── models/
│   │   ├── CrawlSession.js   # Phase 6: schema for one crawl run
│   │   └── ResearchResult.js # Phase 6: schema for one researched page
│   ├── utils/
│   │   ├── urlUtils.js       # Phase 3/5: normalization, same-domain, repair
│   │   └── textUtils.js      # Phase 5: cleanText, decodeHtmlEntities
│   └── scripts/
│       ├── fetch-demo.js     # Phase 1: CLI harness for the fetcher
│       ├── scrape-demo.js    # Phase 2: CLI harness for the scraper
│       ├── crawl-demo.js     # Phase 3: CLI harness for the crawler
│       ├── extract-demo.js   # Phase 4: CLI harness for research extraction
│       ├── clean-demo.js     # Phase 5: CLI harness for cleaning/dedupe
│       └── db-demo.js        # Phase 6: CLI harness for persistence
├── docs/
│   └── phases/               # Phase-by-phase documentation
├── .env                      # Local env vars (gitignored)
├── .env.example              # Env template to commit
├── .gitignore
├── package.json
└── README.md
```

Structure evolves phase-by-phase — files are added only when their phase requires them.

---

## Documentation

- Phase documentation: [`docs/phases/`](docs/phases/)
- Current: [`docs/phases/phase-06.md`](docs/phases/phase-06.md)

---

## License

MIT