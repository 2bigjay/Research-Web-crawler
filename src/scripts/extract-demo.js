// src/scripts/extract-demo.js
//
// Phase 4 test harness: crawl a site for a research topic, then run the topic's
// extractor over each crawled page, printing one structured research item.
//
// Usage:
//   npm run extract-demo -- <url> [--topic robotics-companies]
//   npm run extract-demo -- https://www.universal-robots.com --topic robotics-companies
//
// To list registered topics: run without --topic (still needs a URL, use example.com).

import { crawlWeb } from '../services/crawlerService.js';
import '../services/extractors/index.js'; // registers built-in extractors
import { extractResearch, getTopics } from '../services/extractionService.js';

const args = process.argv.slice(2);
const url = args[0];

if (!url) {
    console.log('Usage: npm run extract-demo -- <url> [--topic <topic>]');
    console.log(`Registered topics: ${getTopics().join(', ') || '(none)'}`);
    process.exit(1);
}

const topicIndex = args.indexOf('--topic');
const topic = topicIndex !== -1 ? args[topicIndex + 1] : 'robotics-companies';

if (!getTopics().includes(topic)) {
    console.error(`Unknown topic "${topic}". Registered topics: ${getTopics().join(', ')}`);
    process.exit(1);
}

try {
    const crawl = await crawlWeb({ startUrl: url, maxDepth: 1, maxPages: 6 });

    console.log('');
    console.log(`=== RESEARCH EXTRACTION ===`);
    console.log(`Topic:      ${topic}`);
    console.log(`Start URL:  ${crawl.startUrl}`);
    console.log(`Pages:      ${crawl.summary.pagesCrawled} crawled, ${crawl.summary.errors} failed`);
    console.log('');

    // Combine the URL with the scraped structure — extractors expect both.
    const items = crawl.results.map((page) =>
        extractResearch({ ...page.scraped, url: page.url }, topic)
    );

    for (const item of items) {
        const d = item.extracted;
        console.log('----------------------------------------');
        console.log(`Company:      ${d.companyName ?? '(none)'}`);
        console.log(`Website:      ${d.website ?? '(none)'}`);
        console.log(`Country:      ${d.country ?? '(none)'}`);
        console.log(`Description:  ${(d.description ?? '(none)').slice(0, 200)}`);
        console.log(`Products:     ${d.products ? `[${d.products.length} found]` : '(none)'}${d.products ? ' ' + d.products.slice(0, 6).join(' · ') : ''}`);
        console.log(`Relevant links (${(d.relevantLinks ?? []).length}):`);
        for (const link of d.relevantLinks ?? []) {
            console.log(`  - ${link.text}  ->  ${link.href}`);
        }
    }
    console.log('----------------------------------------');
    console.log('');
    console.log('Note: these are HEURISTIC extractions. Null fields mean "no confident\nanswer" — ai will tighten these in a later phase.');
} catch (error) {
    console.error(`Extraction failed: ${error.message}`);
    process.exitCode = 1;
}