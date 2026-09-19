// src/services/jobQueue.js
//
// Phase 9: a minimal, honest background job queue for crawls.
//
// Why: a synchronous crawl keeps an HTTP request open for pages×delay seconds,
// and each request eats rate-limit budget while doing so. With a queue,
// POST /api/crawls returns immediately (202) with a session id; the crawl runs
// here, sequentially, one job at a time (politeness by construction).
//
// In-memory on purpose: single-instance deployment, jobs die with the process
// and their DB sessions stay honest (RUNNING rows are left RUNNING on crash,
// which GET /api/crawls/:id reflects). A Redis-backed queue is the upgrade path
// if this ever scales out.

import { randomUUID } from 'node:crypto';
import { crawlWeb } from './crawlerService.js';
import { completeCrawlSession, failCrawlSession, saveResearchResults } from './researchService.js';

const pendingQueue = [];      // jobs waiting for a worker slot
const jobs = new Map();       // all jobs seen this process: id -> job record
let workerBusy = false;

export function getJob(jobId) {
    return jobs.get(jobId) ?? null;
}

export function listJobs({ limit = 20 } = {}) {
    return [...jobs.values()].slice(0, limit);
}

// Register a crawl job against an already-created RUNNING session.
export function enqueueCrawlJob({ sessionId, startUrl, topic, config, createdBy = 'api' }) {
    const job = {
        id: randomUUID(),
        sessionId,
        startUrl,
        topic,
        config,
        createdBy,
        status: 'QUEUED',
        createdAt: new Date(),
        startedAt: null,
        finishedAt: null,
        error: null
    };
    jobs.set(job.id, job);
    pendingQueue.push(job.id);
    pump();
    return job;
}

// Pull the next queued job and run it to completion. One at a time — crawls
// already pace themselves with requestDelayMs; sequential execution keeps the
// politeness promise from compounding.
async function pump() {
    if (workerBusy) return;

    const nextId = pendingQueue.shift();
    if (!nextId) return;

    const job = jobs.get(nextId);
    if (!job || job.status !== 'QUEUED') {
        pump();
        return;
    }

    workerBusy = true;
    job.status = 'RUNNING';
    job.startedAt = new Date();

    try {
        const crawl = await crawlWeb({ startUrl: job.startUrl, ...job.config });
        // crawlWeb handles its own URL validation; normalize now.
        const pages = await saveResearchResults(job.sessionId, crawl, job.topic);
        await completeCrawlSession(job.sessionId, { summary: crawl.summary, errors: crawl.errors });

        job.status = 'COMPLETED';
        job.summary = { pages };
        job.finishedAt = new Date();
    } catch (error) {
        // Per-page errors are already recorded on the crawl; this is a
        // pipeline-level failure (extraction/save/webAtLevel) — FAIL the session.
        await failCrawlSession(job.sessionId, error);
        job.status = 'FAILED';
        job.error = error.message;
        job.finishedAt = new Date();
        console.error(`Crawl job ${job.id} failed: ${error.message}`);
    } finally {
        workerBusy = false;
        pump(); // next in line
    }
}