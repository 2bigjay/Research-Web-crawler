// src/scripts/db-demo.js
//
// Phase 6 test harness: connect to MongoDB → run a small crawl → save the
// session + research results → read them back and print what was persisted.
//
// Usage:
//   npm run db-demo -- <url> [--topic robotics-companies]
//   npm run db-demo -- https://example.com
//
// Requires MongoDB: either a local instance (MONGODB_URI=mongodb://127.0.0.1:27017/research_crawler)
// or an Atlas cluster URI in .env.

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { crawlWeb } from '../services/crawlerService.js';
import '../services/extractors/index.js';
import { saveCrawl, getCrawlSession, getResearchResults } from '../services/researchService.js';

const args = process.argv.slice(2);
const url = args[0] ?? 'https://example.com';

const topicIndex = args.indexOf('--topic');
const topic = topicIndex !== -1 ? args[topicIndex + 1] : 'robotics-companies';

try {
    await connectDatabase();
    console.log('Connected to MongoDB.');

    console.log(`Crawling ${url} ...`);
    const crawl = await crawlWeb({ startUrl: url, maxPages: 5, maxDepth: 1 });

    console.log(`Saving session (${crawl.summary.pagesCrawled} pages, ${crawl.summary.errors} errors)...`);
    const session = await saveCrawl({ crawl, topic });
    console.log(`Session ID: ${session._id}`);
    console.log(`  status  : ${session.status}`);
    console.log(`  startUrl: ${session.startUrl}`);
    console.log(`  summary : ${JSON.stringify(session.summary)}`);
    console.log(`  errors  : ${session.crawlErrors.length} recorded`);

    const saved = await getCrawlSession(session._id);
    console.log(`Read back session: started ${saved.startTime.toISOString()}, finished ${saved.endTime.toISOString()}`);

    const results = await getResearchResults({ session: session._id });
    console.log(`\nResearch results in this session: ${results.length}`);
    for (const r of results.slice(0, 5)) {
        console.log('----------------------------------------');
        console.log(`  title    : ${r.title}`);
        console.log(`  url      : ${r.url}`);
        console.log(`  source   : ${r.source}`);
        console.log(`  topic    : ${r.topic}`);
        console.log(`  extracted: ${JSON.stringify(r.extracted)?.slice(0, 160)}...`);
    }
} catch (error) {
    console.error(`DB demo failed: ${error.message}`);
    process.exitCode = 1;
} finally {
    await disconnectDatabase();
    console.log('\nDisconnected from MongoDB.');
}