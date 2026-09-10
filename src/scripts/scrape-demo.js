// src/scripts/scrape-demo.js
//
// Phase 2 test harness: fetch a permitted public page, then scrape it with
// Cheerio and print the structured result.
//
// Usage:
//   npm run scrape-demo -- https://example.com

import { fetchWebPage } from '../services/webFetcherService.js';
import { scrapePage } from '../services/scraperService.js';

const url = process.argv[2];

if (!url) {
    console.log('Usage: npm run scrape-demo -- <url>');
    console.log('Example: npm run scrape-demo -- https://example.com');
    process.exit(1);
}

try {
    const { html, status } = await fetchWebPage(url);

    if (status >= 400) {
        console.error(`Page returned HTTP ${status} — nothing to scrape.`);
        process.exitCode = 1;
        process.exit();
    }

    // NOTE the two steps: fetch first (Phase 1), then scrape (Phase 2).
    // Scraping READS the page we already have; it does not visit new pages.
    // Discovering and enqueueing the links below is the crawler's job (Phase 3).
    const page = scrapePage(html, url);

    console.log('=== SCRAPED PAGE ===');
    console.log(`Title:       ${page.title || '(none)'}`);
    console.log(`Description: ${page.metaDescription || '(none)'}`);
    console.log(`Keywords:    ${page.metaKeywords || '(none)'}`);
    console.log(`Canonical:   ${page.canonical || '(none)'}`);
    console.log('');

    console.log(`=== HEADINGS (${page.headings.length}) ===`);
    for (const h of page.headings.slice(0, 10)) {
        console.log(`  h${h.level}: ${h.text}`);
    }
    console.log('');

    console.log(`=== PARAGRAPHS (${page.paragraphs.length}) — first 3 ===`);
    for (const p of page.paragraphs.slice(0, 3)) {
        console.log(`  • ${p.slice(0, 180)}...`);
    }
    console.log('');

    console.log(`=== LINKS (${page.links.length}) — first 10 ===`);
    for (const link of page.links.slice(0, 10)) {
        console.log(`  ${link.text ? `"${link.text.slice(0, 40)}"` : '(no text)'} -> ${link.href}`);
    }
    console.log('');
    console.log(`Note: these ${page.links.length} absolute links are exactly what the
crawler in Phase 3 will enqueue to discover pages.`);
} catch (error) {
    console.error(`Scrape failed: ${error.message}`);
    if (error.kind) console.error(`Failure kind: ${error.kind}`);
    process.exitCode = 1;
}