// src/scripts/fetch-demo.js
//
// Phase 1 test harness: fetch any permitted public webpage from the command
// line and inspect the HTTP details it returns.
//
// Usage:
//   npm run fetch-demo -- <url> [--timeout <ms>]
//   Example: npm run fetch-demo -- https://example.com
//   Example: npm run fetch-demo -- https://example.com --timeout 5000

import { fetchWebPage } from '../services/webFetcherService.js';

const args = process.argv.slice(2);
const url = args[0];

if (!url) {
    console.log('Usage: npm run fetch-demo -- <url> [--timeout <ms>]');
    console.log('Example: npm run fetch-demo -- https://example.com');
    process.exit(1);
}

// Tiny flag parser: reads "--timeout <ms>" if present, otherwise the service
// uses its default timeout.
const timeoutIndex = args.indexOf('--timeout');
const rawTimeout = timeoutIndex !== -1 ? Number(args[timeoutIndex + 1]) : undefined;
// Guard against "--timeout abc" producing NaN, which would break the timer.
const timeoutMs = Number.isFinite(rawTimeout) ? rawTimeout : undefined;
if (timeoutIndex !== -1 && timeoutMs === undefined) {
    console.warn('Ignoring invalid --timeout value (expected a number of milliseconds).');
}

try {
    const result = await fetchWebPage(url, { timeoutMs });

    console.log('=== HTTP RESPONSE ===');
    console.log(`URL:          ${result.url}`);
    console.log(`Status:       ${result.status} ${result.statusText}`);
    console.log(`Content-Type: ${result.contentType}`);
    console.log(`Is HTML:      ${result.isHtml}`);
    console.log('');

    // A few headers chosen to show how response metadata is surfaced.
    console.log('=== HEADERS (selected) ===');
    for (const name of ['server', 'date', 'content-length', 'cache-control', 'etag', 'last-modified']) {
        const value = result.headers[name];
        console.log(`${name}: ${value ?? '(not present)'}`);
    }
    console.log('');

    console.log(`=== HTML PREVIEW (first 800 chars of ${result.html.length} total) ===`);
    console.log(result.html.slice(0, 800));
    console.log('');

    // These notes preview decisions the crawler will make later — they are not
    // errors now, just information for learning HTTP.
    if (!result.isHtml) {
        console.warn('Note: response is not an HTML page. The crawler would skip it.');
    }
    if (result.status >= 400) {
        console.warn(`Note: HTTP status ${result.status} was returned. The crawler would record this as a failed page and skip it.`);
    }
} catch (error) {
    console.error(`Fetch failed: ${error.message}`);
    if (error.kind) console.error(`Failure kind: ${error.kind}`);
    process.exitCode = 1;
}