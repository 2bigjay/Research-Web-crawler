// src/services/cleaningService.js
//
// Phase 5: turn raw extracted data into clean, consistent data.
//
// Two responsibilities, deliberately separated:
//   1. cleanResearchItem(item)  — per-field cleaning of an extracted research
//      item (whitespace, entities, empty fields, duplicates, URL repair).
//   2. dedupeCrawlResults(pages) — page-level duplicates: same URL, then same
//      content (the Phase 3 "/index.html == /" problem).
//
// Cleaning is convention-based, not per-topic: a field is treated as a URL when
// its name suggests it (url/website/href/canonical), as text otherwise. New
// extractors get cleaned for free.

import crypto from 'node:crypto';
import { cleanText, decodeHtmlEntities, isEmptyText } from '../utils/textUtils.js';
import { normalizeUrl, repairUrl } from '../utils/urlUtils.js';

// Field-name → kind. Cleaners behave differently per kind.
const URL_FIELD_PATTERN = /url|website|href|canonical/i;

function cleanLink(item) {
    // A link object (e.g. { href, text }) is only worth keeping if it has a URL.
    const href = repairUrl(item.href ?? item.url ?? null);
    if (href === null) return null;
    const text = cleanText(item.text ?? '');
    return { href, text: isEmptyText(text) ? '(no text)' : text };
}

function cleanArray(field, values) {
    const cleaned = [];
    const seen = new Set(); // dedupe keyed by content or by link href
    for (const value of values) {
        const item = cleanStructure(value);
        // Drop entries that cleaned to nothing (null, empty string, empty array).
        if (item === null || (typeof item === 'string' && isEmptyText(item))) continue;
        if (Array.isArray(item) && item.length === 0) continue;

        // A dedupe key: plain strings compare case-insensitively; link objects
        // dedupe by their href (the URL is the identity of a link).
        let key;
        if (typeof item === 'string') key = item.toLowerCase();
        else if (typeof item === 'object' && item.href !== undefined) key = `link:${item.href}`;
        else key = JSON.stringify(item);

        if (key !== undefined && seen.has(key)) continue;
        if (key !== undefined) seen.add(key);
        cleaned.push(item);
    }
    return cleaned.length > 0 ? cleaned : null;
}

function cleanStructure(value) {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return cleanArray('__array__', value);
    if (typeof value === 'object') {
        const out = {};
        for (const [key, val] of Object.entries(value)) {
            if (key === 'href' || key === 'url') {
                // Link-like sub-objects (relevantLinks items).
                const link = cleanLink(value);
                return link;
            }
            const cleaned = cleanValue(key, val);
            if (cleaned !== null) out[key] = cleaned;
        }
        return Object.keys(out).length > 0 ? out : null;
    }
    return value;
}

function cleanValue(field, value) {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return cleanArray(field, value);
    if (typeof value === 'object') return cleanStructure(value);

    // URL-ish field: validate/repair, else null.
    if (URL_FIELD_PATTERN.test(field)) {
        return repairUrl(value);
    }

    // Plain text: decode entities, collapse whitespace, drop empties.
    const text = decodeHtmlEntities(cleanText(value));
    return isEmptyText(text) ? null : text;
}

// Clean a research item produced by extractionService.extractResearch():
// { topic, extracted: { ...scalar + array fields } }. Returns a new object;
// the input is never mutated.
export function cleanResearchItem(item) {
    if (!item || typeof item !== 'object') return item;

    const extracted = {};
    for (const [field, value] of Object.entries(item.extracted ?? {})) {
        const cleaned = cleanValue(field, value);
        if (cleaned !== null) extracted[field] = cleaned;
    }

    return { topic: item.topic, extracted };
}

// ---- page-level deduplication ----------------------------------------------

// A cheap content fingerprint: title + first paragraph. Not perfect (two pages
// could collide), but catches the "same page, different URL spelling" case that
// URL normalization cannot, which is exactly what we observed in Phase 3.
function pageFingerprint(page) {
    const title = cleanText(page.title ?? '');
    const opening = cleanText(page.scraped?.paragraphs?.[0] ?? '');
    const hash = crypto.createHash('sha256').update(`${title}|${opening}`).digest('hex');
    return hash;
}

export function dedupeCrawlResults(results = []) {
    const unique = [];
    const urlSeen = new Set();
    const contentSeen = new Set();
    let duplicateByUrl = 0;
    let duplicateByContent = 0;

    for (const page of results) {
        const urlKey = normalizeUrl(page.url ?? page.finalUrl ?? '');
        if (urlKey === null || urlSeen.has(urlKey)) {
            duplicateByUrl += 1;
            continue;
        }
        urlSeen.add(urlKey);

        const fingerprint = pageFingerprint(page);
        if (contentSeen.has(fingerprint)) {
            duplicateByContent += 1;
            continue;
        }
        contentSeen.add(fingerprint);
        unique.push(page);
    }

    return {
        pages: unique,
        summary: {
            input: results.length,
            output: unique.length,
            duplicateByUrl,
            duplicateByContent
        }
    };
}