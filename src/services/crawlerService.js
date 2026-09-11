// src/services/crawlerService.js
//
// Phase 3: the crawler engine. It combines the Phase 1 fetcher and the
// Phase 2 scraper into a loop that discovers pages responsibly.
//
// Core concepts:
//   QUEUE  — a to-do list of URLs (with their crawl depth). The crawler works
//            through it one URL at a time. A FIFO (first-in first-out) queue
//            gives breadth-first behaviour: shallow pages before deep ones.
//   VISITED SET — every URL we have planned to fetch, kept in one canonical
//            form (see urlUtils.normalizeUrl). It guarantees no page is ever
//            requested twice and stops links re-entering the queue forever.
//
// Safety is built in, not bolted on: page cap, depth cap, same-domain rule,
// a politeness delay between requests, and a per-request timeout.

import { fetchWebPage, DEFAULT_TIMEOUT_MS } from './webFetcherService.js';
import { scrapePage } from './scraperService.js';
import { normalizeUrl, isSameDomain } from '../utils/urlUtils.js';

// Conservative, configurable limits (Rule: crawl only permitted public content).
export const DEFAULT_MAX_PAGES = 20;
export const DEFAULT_MAX_DEPTH = 2;
export const DEFAULT_REQUEST_DELAY_MS = 1000; // pause between requests
export const DEFAULT_CRAWL_TIMEOUT_MS = 10000;

// Read a positive integer from the environment, or null when unset/invalid.
// Lets operators tune limits per environment without touching code.
function envInt(name) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return null;
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
}

// Precedence so real values can't be clobbered: explicit options > .env > defaults.
function resolveConfig(options = {}) {
    return {
        maxPages: options.maxPages ?? envInt('CRAWL_MAX_PAGES') ?? DEFAULT_MAX_PAGES,
        maxDepth: options.maxDepth ?? envInt('CRAWL_MAX_DEPTH') ?? DEFAULT_MAX_DEPTH,
        requestDelayMs: options.requestDelayMs ?? envInt('CRAWL_DELAY_MS') ?? DEFAULT_REQUEST_DELAY_MS,
        timeoutMs: options.timeoutMs ?? envInt('CRAWL_TIMEOUT_MS') ?? DEFAULT_CRAWL_TIMEOUT_MS
    };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function crawlWeb({ startUrl, ...options } = {}) {
    const config = resolveConfig(options);

    // One normalized starting URL; nothing else may be crawled.
    const start = normalizeUrl(startUrl);
    if (start === null) {
        throw new Error(`Invalid start URL: "${startUrl}"`);
    }

    // ---- QUEUE: entries we still have to visit. Each carries its depth,
    // so the crawler knows how deep into the site it has travelled.
    const queue = [{ url: start, depth: 0 }];

    // ---- VISITED SET: everything planned (dedupe + never-fetch-twice).
    const visited = new Set([start]);

    const results = [];      // successfully scraped HTML pages
    const errors = [];       // per-URL failures (kept, not thrown)
    let nonHtmlSkipped = 0;

    // Work the queue while there are URLs left AND we are under the page cap.
    while (queue.length > 0 && results.length < config.maxPages) {
        const { url, depth } = queue.shift(); // FIFO: breadth-first

        // Polite pacing: one request per page, spaced by the delay.
        // (Not applied to the very first request below.)
        let page;
        try {
            page = await fetchWebPage(url, { timeoutMs: config.timeoutMs });

            // URL might have been rewritten by redirects; if redirects left
            // the site domain, treat it as out of scope.
            if (!isSameDomain(page.url, start) && page.url !== url) {
                continue;
            }
        } catch (error) {
            errors.push({ url, message: error.message, kind: error.kind ?? 'FETCH' });
            await sleep(config.requestDelayMs);
            continue;
        }

        if (page.status >= 400 || !page.isHtml) {
            if (!page.isHtml) nonHtmlSkipped += 1;
            // Non-success or non-HTML: nothing worth extracting or following.
            await sleep(config.requestDelayMs);
            continue;
        }

        const scraped = scrapePage(page.html, url);
        results.push({
            url,
            finalUrl: page.url,
            depth,
            status: page.status,
            title: scraped.title,
            scraped
        });

        // ---- DISCOVERY: follow links, but only while we have depth budget.
        if (depth < config.maxDepth) {
            for (const link of scraped.links) {
                const candidate = normalizeUrl(link.href);
                if (candidate === null) continue;          // non-web / malformed
                if (!isSameDomain(candidate, start)) continue; // stay on-site
                if (visited.has(candidate)) continue;      // never twice
                visited.add(candidate);                    // claim it now
                queue.push({ url: candidate, depth: depth + 1 });
            }
        }

        await sleep(config.requestDelayMs);
    }

    return {
        startUrl: start,
        config: {
            maxPages: config.maxPages,
            maxDepth: config.maxDepth,
            requestDelayMs: config.requestDelayMs,
            timeoutMs: config.timeoutMs
        },
        summary: {
            queueExhausted: queue.length === 0,
            reachedPageCap: results.length >= config.maxPages,
            pagesCrawled: results.length,
            pagesPlanned: visited.size,
            nonHtmlSkipped,
            errors: errors.length
        },
        errors,
        results
    };
}