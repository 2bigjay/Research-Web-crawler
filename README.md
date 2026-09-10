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

**Phase 0 — Project Foundation** (done)

A minimal Express server with a health check endpoint running at `GET /api/health`.

Each phase is documented under [`docs/phases/`](docs/phases/).

| # | Phase | Status |
|---|-------|--------|
| 0 | Project Foundation | ✅ Done |
| 1 | HTTP & Web Fundamentals | ⬜ Pending |
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
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

---

## Project Structure

```
research-crawler/
├── src/
│   └── server.js          # Express server entry point
├── docs/
│   └── phases/            # Phase-by-phase documentation
├── .env                   # Local env vars (gitignored)
├── .env.example           # Env template to commit
├── .gitignore
├── package.json
└── README.md
```

Structure evolves phase-by-phase — files are added only when their phase requires them.

---

## Documentation

- Phase documentation: [`docs/phases/`](docs/phases/)
- Current: [`docs/phases/phase-00.md`](docs/phases/phase-00.md)

---

## License

MIT