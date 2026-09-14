// src/utils/textUtils.js
//
// Phase 5: reusable text-cleaning helpers.
// These steps belong in ONE place because scraping (Phase 2), extraction
// (Phase 4) and the cleaner all need them — duplicating this logic across
// services would drift apart and fix bugs everywhere at once.

// Collapse runs of whitespace to a single space and trim the edges.
// Pitfall this solves: HTML contains newlines + indentation, so
// "Hello,\n      world" would otherwise keep its weird internal spacing.
// Also defends against null/undefined (some extractors skip fields).
export function cleanText(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
}

export function isEmptyText(value) {
    return cleanText(value) === '';
}

// Decode HTML character references.
// Why needed: Cheerio's .text() already decodes entities for element text,
// but attribute values (.attr('content')) do NOT get decoded — so extracted
// metadata can arrive as "Vent&#39;s &amp; Sons". We decode those here.
//
// Named references are decoded from a small whitelist; anything unknown is
// left untouched (decoding wrongly is worse than leaving text intact).
const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    nbsp: ' ', copy: '©', reg: '®', trade: '™',
    hellip: '…', mdash: '—', ndash: '–', bull: '•', middot: '·',
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    eacute: 'é', egrave: 'è', agrave: 'à', icirc: 'î', uuml: 'ü', ouml: 'ö', auml: 'ä'
};

function fromCodePointSafely(code) {
    // fromCodePoint throws on lone surrogates (0xD800–0xDFFF) and out-of-range
    // values; guard so one weird entity can't crash the whole pipeline.
    try {
        return String.fromCodePoint(code);
    } catch {
        return '';
    }
}

export function decodeHtmlEntities(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        // Numeric: &#38; (decimal) and &#x26; (hexadecimal)
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => fromCodePointSafely(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => fromCodePointSafely(parseInt(dec, 10)))
        // Named: &amp; &copy; ...
        .replace(/&([a-zA-Z]+);/g, (match, name) => NAMED_ENTITIES[name] ?? match);
}