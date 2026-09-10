// src/services/scraperService.js
//
// Phase 2: turn raw HTML into structured, useful information with Cheerio.
// This is "scraping" — extracting data that already sits in one page.
// "Crawling" — discovering OTHER pages from the links — arrives in Phase 3.

import * as cheerio from 'cheerio';

// Light text cleanup so scraped values read sensibly. Raw HTML text is full of
// newlines, indentation, and stray spacing (e.g. "Hello\n      world").
// Heavy-duty normalization (HTML entities, deduplication, malformed URLs)
// is deliberately left for Phase 5 — scraping and cleaning are separate steps.
function cleanText(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

// Resolve a possibly-relative href against the page URL.
// Examples:  href="/about"  +  baseUrl "https://site.com/start"
//            => "https://site.com/about"
//            href="//other.com/x" (protocol-relative)
//            => "https://other.com/x"
// Returns null for non-web references (javascript:, mailto:, malformed URLs).
// The future crawler needs absolute URLs so it can enqueue and compare them.
function resolveUrl(href, baseUrl) {
    try {
        const resolved = new URL(href, baseUrl);
        return (resolved.protocol === 'http:' || resolved.protocol === 'https:')
            ? resolved.toString()
            : null;
    } catch {
        return null; // malformed reference — skip it
    }
}

export function scrapePage(html, pageUrl) {
    const $ = cheerio.load(html);

    const title = cleanText($('title').first().text());

    const metaDescription = $('meta[name="description"]').attr('content') ?? '';
    const metaKeywords = $('meta[name="keywords"]').attr('content') ?? '';
    // The canonical URL is the site's own statement of "this is the real URL
    // for this page" — more trustworthy than whatever URL we arrived at.
    const canonical = $('link[rel="canonical"]').attr('href') ?? '';

    const headings = [];
    $('h1, h2, h3').each((_, el) => {
        const level = Number(el.tagName.slice(1)); // "h2" -> 2
        const text = cleanText($(el).text());
        if (text) headings.push({ level, text });
    });

    const paragraphs = [];
    $('p').each((_, el) => {
        const text = cleanText($(el).text());
        if (text) paragraphs.push(text);
    });

    // Collect outbound links as absolute URLs, skipping duplicates.
    // A Set gives us deduplication for free ($(".prev")-style repeats are common).
    const links = [];
    const seen = new Set();
    $('a[href]').each((_, el) => {
        const absolute = resolveUrl($(el).attr('href'), pageUrl);
        if (absolute && !seen.has(absolute)) {
            seen.add(absolute);
            links.push({ href: absolute, text: cleanText($(el).text()) });
        }
    });

    return {
        title,
        metaDescription,
        metaKeywords,
        canonical,
        headings,
        paragraphs,
        links
    };
}