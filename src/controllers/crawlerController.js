// src/controllers/crawlerController.js
//
// Phase 7: HTTP glue for crawls. Thin on purpose — request parsing and
// response shaping only; the heavy lifting stays in crawlerService (Phase 3)
// and researchService (Phase 6).

import { crawlWeb } from '../services/crawlerService.js';
import { saveCrawl, getCrawlSession, getCrawlSessions, countCrawlSessions, getResearchResults } from '../services/researchService.js';

// POST /api/crawls — run a crawl synchronously, persist it, return the session.
export async function startCrawl(req, res, next) {
    try {
        const { startUrl, topic = 'robotics-companies' } = req.body;
        const crawl = await crawlWeb({
            startUrl,
            maxPages: req.body.maxPages,
            maxDepth: req.body.maxDepth,
            requestDelayMs: req.body.requestDelayMs,
            timeoutMs: req.body.timeoutMs
        });
        const session = await saveCrawl({ crawl, topic });
        res.status(201).json({
            success: true,
            data: session,
            resultsCount: crawl.summary.pagesCrawled
        });
    } catch (error) {
        next(error);
    }
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