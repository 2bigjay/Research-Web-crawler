// src/scripts/clean-demo.js
//
// Phase 5 test harness: crawl → dedupe duplicate pages → extract → clean each
// research item, then show what cleaning actually changed.
//
// Usage:
//   npm run clean-demo -- <url> [--topic robotics-companies]
//   npm run clean-demo -- https://books.toscrape.com --max-pages 8

import { crawlWeb } from '../services/crawlerService.js';
import '../services/extractors/index.js';
import { extractResearch, getTopics } from '../services/extractionService.js';
import { cleanResearchItem, dedupeCrawlResults } from '../services/cleaningService.js';

const args = process.argv.slice(2);
const url = args[0];

if (!url) {
    console.log('Usage: npm run clean-demo -- <url> [--topic <topic>]');
    console.log(`Registered topics: ${getTopics().join(', ')}`);
    process.exit(1);
}

function flag(name) {
    const index = args.indexOf(name);
    if (index === -1) return undefined;
    const value = Number(args[index + 1]);
    return Number.isInteger(value) ? value : undefined;
}

const topicIndex = args.indexOf('--topic');
const topic = topicIndex !== -1 ? args[topicIndex + 1] : 'robotics-companies';

try {
    const crawl = await crawlWeb({ startUrl: url, maxPages: flag('--max-pages') ?? 8, maxDepth: 1 });

    console.log('');
    console.log('=== STEP 1 — deduplicate duplicate PAGES ===');
    console.log(`Reviewed ${crawl.summary.pagesCrawled} crawled pages`);
    const deduped = dedupeCrawlResults(crawl.results);
    console.log(`  kept            : ${deduped.summary.output}`);
    console.log(`  duplicate URL   : ${deduped.summary.duplicateByUrl}`);
    console.log(`  duplicate content: ${deduped.summary.duplicateByContent}`);

    console.log('');
    console.log('=== STEP 2 — extract ' + topic + ' ===');
    console.log('=== STEP 3 — clean each item (entities, whitespace, empties, URLs) ===');
    console.log('');

    for (const page of deduped.pages) {
        const before = extractResearch({ ...page.scraped, url: page.url }, topic);
        const after = cleanResearchItem(before);

        console.log('----------------------------------------');
        console.log(`Before  name:    ${JSON.stringify(before.extracted.companyName)}`);
        console.log(`After   name:    ${JSON.stringify(after.extracted.companyName)}`);
        console.log(`Before  desc:    ${JSON.stringify((before.extracted.description ?? '(none)').slice(0, 90))}`);
        console.log(`After   desc:    ${JSON.stringify((after.extracted.description ?? '(none)').slice(0, 90))}`);
        console.log(`Before  products(${(before.extracted.products ?? []).length}): ${(before.extracted.products ?? []).slice(0, 4).join(', ')}`);
        console.log(`After   products(${(after.extracted.products ?? []).length}): ${(after.extracted.products ?? []).slice(0, 4).join(', ')}`);
        console.log(`website: ${after.extracted.website ?? '(none)'}`);
    }
    console.log('');
} catch (error) {
    console.error(`Clean demo failed: ${error.message}`);
    process.exitCode = 1;
}