// src/controllers/crawlerController.js
//
// Phase 7/9: HTTP glue for crawls. Thin on purpose — request parsing and
// response shaping only; the heavy lifting stays in crawlerService (Phase 3),
// researchService (Phase 6) and the job queue (Phase 9).

import { crawlWeb } from '../services/crawlerService.js';
import { saveCrawl, createCrawlSession, getCrawlSession, getCrawlSessions, countCrawlSessions, getResearchResults } from '../services/researchService.js';
import { enqueueCrawlJob } from '../services/jobQueue.js';

// POST /api/crawls
//   { ... , "sync": false } (default): 202 — session created RUNNING, crawl queued.
//   { ... , "sync": true }:             201 — crawl runs inline, returns completed session.
export async function startCrawl(req, res, next) {
    try {
        const { startUrl, topic = 'robotics-companies', config } = extractCrawlRequest(req);

        if (req.body.sync === true) {
            // Synchronous path (preserves pre-Phase-9 behaviour, one HTTP trip).
            const crawl = await crawlWeb({ startUrl, ...config });
            const session = await saveCrawl({ crawl, topic });
            return res.status(201).json({
                success: true,
                data: session,
                resultsCount: crawl.summary.pagesCrawled,
                mode: 'sync'
            });
        }

        // Background path: persist immediately so the client can poll the
        // session, then let the queue do the crawling.
        const session = await createCrawlSession({ startUrl, topic, config });
        const job = enqueueCrawlJob({ sessionId: session._id, startUrl, topic, config });
        return res.status(202).json({
            success: true,
            message: 'Crawl started in the background. Poll GET /api/crawls/:id to follow progress.',
            data: session,
            jobId: job.id,
            jobStatus: job.status,
            mode: 'async'
        });
    } catch (error) {
        next(error);
    }
}

function extractCrawlRequest(req) {
    const config = {};
    for (const key of ['maxPages', 'maxDepth', 'requestDelayMs', 'timeoutMs']) {
        if (req.body[key] !== undefined && req.body[key] !== null) {
            config[key] = req.body[key];
        }
    }
    return { startUrl: req.body.startUrl, topic: req.body.topic, config };
}

// GET /api/crawls — list sessions, newest first, with pagination.
export async function listCrawls(req, res, next) {
    try {
        // Validation guaranteed integer-ness; coerce the strings to numbers so
        // the echoed pagination is clean ("5" -> 5).
        const limit = Number(req.query.limit) || 20;
        const skip = Number(req.query.skip) || 0;
        const data = await getCrawlSessions({ limit, skip });
        const total = await countCrawlSessions();
        res.json({ success: true, data, total, limit, skip });
    } catch (error) {
        next(error);
    }
}

// GET /api/crawls/:id — one session, with its research results attached.
export async function getCrawl(req, res, next) {
    try {
        const session = await getCrawlSession(req.params.id);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Crawl session not found' });
        }
        const { data: results } = await getResearchResults({ session: session._id, limit: 200 });
        res.json({ success: true, data: { ...session.toObject(), results } });
    } catch (error) {
        next(error);
    }
}