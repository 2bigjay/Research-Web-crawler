// src/utils/urlUtils.js
//
// URL helpers for the crawler.
//
// Two URLs can point at the same page even when their strings differ:
//   https://example.com/page#section1  vs  https://example.com/page#section2
//   https://EXAMPLE.com                 vs  https://example.com/
// The visited set needs ONE canonical form per page, or the crawler would
// re-fetch the same content for every slightly different spelling.
//
// Deep cleaning (bad URLs, query noise, duplicate pages) is Phase 5; here we
// only normalize enough that deduplication works correctly.

// Returns one canonical string for a URL, or null if it cannot be parsed.
// Rules:
//   - only http/https are acceptable (the crawler never touches other schemes)
//   - hostname is lowercased  (hosts are case-insensitive by DNS rules)
//   - the #fragment is removed (it selects a part of the SAME page)
//   - an empty path becomes "/" (https://x.com and https://x.com/ are identical)
export function normalizeUrl(value) {
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return null; // unparseable => not useful to the crawler
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    parsed.hash = ''; // drop the fragment — same document, different anchor
    if (parsed.pathname === '') parsed.pathname = '/'; // host-only URLs

    return parsed.toString(); // URL normalizes the rest (lowercased host, etc.)
}

export function getHostname(value) {
    try {
        return new URL(value).hostname;
    } catch {
        return null;
    }
}

// Does candidate live on the same website as base?
// Comparing hostnames is the key trick: it lets the crawler never leave the
// site it started on, even when a page links out (Phase 2's Wikipedia example
// had 1742 links — almost all pointing away or at repeat pages).
export function isSameDomain(candidate, base) {
    const candidateHost = getHostname(candidate);
    const baseHost = getHostname(base);
    return candidateHost !== null && candidateHost === baseHost;
}