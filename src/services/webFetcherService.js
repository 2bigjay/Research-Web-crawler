// src/services/webFetcherService.js
//
// Phase 1: a small service that fetches a permitted public webpage and returns
// its HTML. This is the HTTP layer the crawler will rely on in Phase 3.
// We are NOT building the crawler yet — only the request/response plumbing.

// Why a timeout? A request that never resolves would hang the process forever.
// AbortController + setTimeout gives us a reliable way to cancel a stalled fetch.
export const DEFAULT_TIMEOUT_MS = 10000;

// The service only talks to absolute http/https URLs. Restricting the protocol
// here is the first small safety net; later phases extend this idea with
// domain checks, crawl limits, and robots.txt.
export function isValidHttpUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false; // not parseable => not a valid absolute URL
    }
}

// A dedicated error type lets callers distinguish failure reasons
// (invalid URL vs timeout vs network issue). The crawler will need this
// distinction later to report crawl errors properly.
export class FetchError extends Error {
    constructor(message, { kind = 'GENERIC', status = null, url = null, cause = null } = {}) {
        super(message, { cause });
        this.name = 'FetchError';
        this.kind = kind; // 'INVALID_URL' | 'TIMEOUT' | 'NETWORK' | 'GENERIC'
        this.status = status;
        this.url = url;
    }
}

export async function fetchWebPage(url, options = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (typeof url !== 'string' || !isValidHttpUrl(url)) {
        throw new FetchError(`Invalid URL: "${url}"`, { kind: 'INVALID_URL', url });
    }

    // AbortController cancels the underlying fetch when the deadline passes.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                // Responsible crawlers identify themselves so site owners can
                // contact us. We request a normal browser-like content: HTML.
                'User-Agent': 'ResearchWebCrawler/0.1 (+https://github.com/2bigjay/Research-Web-crawler)',
                'Accept': 'text/html,application/xhtml+xml'
            },
            redirect: 'follow' // Node follows redirects; the final URL is in response.url
        });

        // Capture HTTP metadata BEFORE reading the body. The status and headers
        // tell us whether this is a page worth keeping or an error/redirect.
        const contentType = response.headers.get('content-type') ?? '';
        const html = await response.text();

        return {
            url: response.url,       // final URL — it changes if the site redirected us
            status: response.status, // e.g. 200, 301, 404, 500
            statusText: response.statusText,
            contentType,
            isHtml: contentType.includes('text/html'),
            headers: Object.fromEntries(response.headers.entries()),
            html
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            // The timer fired: the response did not arrive in time.
            throw new FetchError(`Request timed out after ${timeoutMs}ms`, { kind: 'TIMEOUT', url });
        }
        throw new FetchError(`Network error fetching "${url}": ${error.message}`, {
            kind: 'NETWORK',
            url,
            cause: error
        });
    } finally {
        clearTimeout(timer); // request finished — nothing left to cancel
    }
}