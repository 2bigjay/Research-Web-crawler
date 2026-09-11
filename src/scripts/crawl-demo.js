// src/scripts/crawl-demo.js
//
// Phase 3 test harness: crawl a permitted site and print live progress.
//
// Usage:
//   npm run crawl-demo -- <start-url> [--max-pages N] [--max-depth N]
//                        [--delay <ms>] [--timeout <ms>]
//   Example: npm run crawl-demo -- https://example.com
//   Example: npm run crawl-demo -- https://books.toscrape.com --max-pages 10

import { crawlWeb } from '../services/crawlerService.js';
import { normalizeUrl } from '../utils/urlUtils.js';

const args = process.argv.slice(2);
const startUrl = args[0];

if (!startUrl) {
    console.log('Usage: npm run crawl-demo -- <url> [--max-pages N] [--max-depth N] [--delay <ms>] [--timeout <ms>]');
    console.log('Example: npm run crawl-demo -- https://example.com');
    process.exit(1);
}

// Read a numeric flag like "--max-pages 10". Undefined if absent/invalid.
function flag(name) {
    const index = args.indexOf(name);
    if (index === -1) return undefined;
    const value = Number(args[index + 1]);
    return Number.isInteger(value) ? value : undefined;
}

try {
    const result = await crawlWeb({
        startUrl,
        maxPages: flag('--max-pages'),
        maxDepth: flag('--max-depth'),
        requestDelayMs: flag('--delay'),
        timeoutMs: flag('--timeout')
    });

    console.log('');
    console.log('==== CRAWL COMPLETE ====');
    console.log(`Start URL:    ${result.startUrl}`);
    console.log(`Limits:       max ${result.config.maxPages} pages, depth ${result.config.maxDepth}, delay ${result.config.requestDelayMs}ms`);
    console.log(`Pages crawled: ${result.summary.pagesCrawled} (of ${result.summary.pagesPlanned} planned)`);
    console.log(`Non-HTML skipped: ${result.summary.nonHtmlSkipped}`);
    console.log(`Errors:       ${result.summary.errors} (${result.summary.queueExhausted ? 'queue exhausted' : result.summary.reachedPageCap ? 'page cap reached' : 'stopped'})`);
    console.log('');

    if (result.errors.length > 0) {
        console.log('=== FAILED REQUESTS ===');
        for (const err of result.errors) {
            console.log(`  [${err.kind}] ${err.url} — ${err.message}`);
        }
        console.log('');
    }

    console.log('=== CRAWLED PAGES — the queue in action ===');
    for (const page of result.results) {
        console.log(`  d${page.depth} ${page.status} ${page.title ? page.title.slice(0, 50) : '(no title)'}`);
        console.log(`      ${page.url}`);
        console.log(`      ${page.scraped.paragraphs.length} paragraphs, ${page.scraped.links.length} links found`);
    }
    console.log('');
} catch (error) {
    console.error(`Crawl failed: ${error.message}`);
    process.exitCode = 1;
}