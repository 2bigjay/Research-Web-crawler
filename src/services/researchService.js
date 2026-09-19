// src/services/researchService.js
//
// Phase 6/9: business logic for persisting and reading research data.
// It composes the pipeline (crawl → extract → clean) with Mongo persistence.
//
// Phase 9 added an ASYNC lifecycle: a session is created as RUNNING up front,
// filled in when the crawl finishes, and marked COMPLETED or FAILED by the job
// worker. saveCrawl() (the old synchronous all-in-one) stays as the CLI-harness
// path, composed from the same building blocks.

import CrawlSession from '../models/CrawlSession.js';
import ResearchResult from '../models/ResearchResult.js';
import { isDatabaseConnected } from '../config/database.js';
import { extractResearch } from './extractionService.js';
import { cleanResearchItem } from './cleaningService.js';
import { getHostname } from '../utils/urlUtils.js';

// Guard against saving into the void — clear error beats a silent hang.
function requireDatabase() {
    if (!isDatabaseConnected()) {
        throw new Error('Database not connected. Set MONGODB_URI and call connectDatabase() before saving.');
    }
}

// Create the RUNNING session row a background job will later complete or fail.
// Optional `crawl` pre-fills the resolved config (when known before crawling).
export async function createCrawlSession({ startUrl, topic, config = null, runType = 'manual' }) {
    requireDatabase();
    return CrawlSession.create({
        startUrl,
        topic,
        status: 'RUNNING',
        config,
        runType
    });
}

// Mark a session COMPLETED with its final summary, error list and endTime.
export async function completeCrawlSession(sessionId, { summary, errors }) {
    return CrawlSession.findByIdAndUpdate(
        sessionId,
        { status: 'COMPLETED', summary, crawlErrors: errors ?? [], endTime: new Date(), failure: null },
        { returnDocument: 'after' }
    );
}

// Mark a session FAILED and record why. Best-effort: the DB may itself be the
// reason, so a failure to record is logged, not thrown.
export async function failCrawlSession(sessionId, error) {
    try {
        return await CrawlSession.findByIdAndUpdate(
            sessionId,
            { status: 'FAILED', failure: error?.message ?? String(error), endTime: new Date() },
            { returnDocument: 'after' }
        );
    } catch (recordError) {
        console.error('Could not record session failure:', recordError.message);
        return null;
    }
}

// One extracted+cleaned ResearchResult document per crawled page.
export async function saveResearchResults(sessionId, crawl, topic) {
    requireDatabase();
    if (!topic) {
        throw new Error('saveResearchResults requires a "topic" to structure the research results.');
    }

    const now = new Date();
    const resultDocs = crawl.results.map((page) => {
        const item = extractResearch({ ...page.scraped, url: page.url }, topic);
        const cleaned = cleanResearchItem(item);
        return {
            session: sessionId,
            topic,
            url: page.url,
            title: page.title ?? '',
            source: getHostname(page.url) ?? '',
            depth: page.depth,
            status: page.status,
            content: page.scraped.paragraphs ?? [],
            extracted: cleaned.extracted,
            crawledAt: now
        };
    });

    if (resultDocs.length > 0) {
        // Unique index (session+url) makes re-saving a page idempotent-ish;
        // duplicates would be rejected rather than silently doubling.
        await ResearchResult.insertMany(resultDocs);
    }
    return resultDocs.length;
}

// Synchronous all-in-one path (Phase 6 CLI harness): a finished crawl becomes
// a single session + N results. Kept for db-demo compatibility.
export async function saveCrawl({ crawl, topic }) {
    requireDatabase();

    const session = await createCrawlSession({ startUrl: crawl.startUrl, topic, config: crawl.config, runType: 'sync' });
    await saveResearchResults(session._id, crawl, topic);
    return completeCrawlSession(session._id, { summary: crawl.summary, errors: crawl.errors });
}

export async function getCrawlSession(sessionId) {
    return CrawlSession.findById(sessionId);
}

export async function getCrawlSessions({ limit = 20, skip = 0 } = {}) {
    // Newest crawl first.
    return CrawlSession.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);
}

export async function countCrawlSessions(filter = {}) {
    return CrawlSession.countDocuments(filter);
}

// Results are returned as { data, total } so controllers can build honest
// pagination (Phase 7) without a second query.
export async function getResearchResults({ session, topic, source, limit = 20, skip = 0, sort = 'crawledAt', order = 'desc' } = {}) {
    const filter = {};
    if (session) filter.session = session;
    if (topic) filter.topic = topic;
    if (source) filter.source = source;
    const data = await ResearchResult.find(filter)
        .sort({ [sort]: order === 'asc' ? 1 : -1 })
        .limit(limit)
        .skip(skip);
    const total = await ResearchResult.countDocuments(filter);
    return { data, total };
}

export async function getResearchResult(resultId) {
    return ResearchResult.findById(resultId);
}

export async function deleteResearchResult(resultId) {
    return ResearchResult.findByIdAndDelete(resultId);
}

// Free-text search across the searchable fields. Tagged with \b-boundaries and
// regex-escaped so user input can't inject into the query.
export async function searchResearchResults({ q, limit = 20, skip = 0 } = {}) {
    const filter = {};
    if (q) {
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(escaped, 'i');
        filter.$or = [{ title: rx }, { source: rx }, { url: rx }, { content: rx }];
    }
    const data = await ResearchResult.find(filter)
        .sort({ crawledAt: -1 })
        .limit(limit)
        .skip(skip);
    const total = await ResearchResult.countDocuments(filter);
    return { data, total };
}