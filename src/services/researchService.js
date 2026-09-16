// src/services/researchService.js
//
// Phase 6: business logic for persisting and reading research data.
// It composes the pipeline (crawl → extract → clean) with Mongo persistence,
// and exposes query helpers the future REST API (Phase 7) will depend on.

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

// Persist one finished crawl (crawlWeb result) as a CrawlSession plus one
// ResearchResult per crawled page. Returns the created session.
export async function saveCrawl({ crawl, topic }) {
    requireDatabase();

    if (!topic) {
        throw new Error('saveCrawl requires a "topic" to structure the research results.');
    }

    const now = new Date();
    const session = await CrawlSession.create({
        startUrl: crawl.startUrl,
        topic,
        status: 'COMPLETED',
        config: crawl.config,
        summary: crawl.summary,
        crawlErrors: crawl.errors,
        startTime: now,
        endTime: now
    });

    // One extracted+cleaned research item per crawled page.
    const resultDocs = crawl.results.map((page) => {
        const item = extractResearch({ ...page.scraped, url: page.url }, topic);
        const cleaned = cleanResearchItem(item);
        return {
            session: session._id,
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

    return session;
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