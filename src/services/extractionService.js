// src/services/extractionService.js
//
// Phase 4: turn a scraped page into a STRUCTURED research item for a specific
// topic. The trick is a registry: instead of one monolithic "robotics" parser,
// each research topic registers its own extractor. Adding a topic later means
// writing one module and registering it — nothing in the core changes.
//
// NOTE: extraction is heuristic (hand-written rules) until Phase 10. Heuristics
// are honest: they return null when there is no confident answer rather than
// guessing. AI will later replace/augment these rules.

const extractors = new Map();

// An extractor must provide `extract(page)` returning a plain object.
// `page` is the scraped page structure: { url, title, siteName,
// metaDescription, canonical, headings, paragraphs, listItems, links }.
export function registerExtractor(topic, extractor) {
    if (typeof topic !== 'string' || topic.trim() === '') {
        throw new Error('Topic name must be a non-empty string');
    }
    if (!extractor || typeof extractor.extract !== 'function') {
        throw new Error(`Extractor for "${topic}" must provide an extract(page) method`);
    }
    extractors.set(topic.trim(), extractor);
}

export function getTopics() {
    return [...extractors.keys()];
}

// Scalar fields that come back as empty strings are "no value found":
// normalize them to null so downstream phases can treat null as missing.
function blankToNull(value) {
    if (value === undefined) return null;
    return typeof value === 'string' && value.trim() === '' ? null : value;
}

export function extractResearch(page, topic) {
    const extractor = extractors.get(topic?.trim() ?? '');
    if (!extractor) {
        const available = getTopics().join(', ') || '(none registered)';
        throw new Error(`No extractor registered for topic "${topic}". Available topics: ${available}`);
    }

    const extracted = extractor.extract(page);

    // Shape guard: even a buggy extractor returns a plain object.
    if (typeof extracted !== 'object' || extracted === null || Array.isArray(extracted)) {
        throw new Error(`Extractor for "${topic}" returned a non-object result`);
    }

    // Normalize empty scalars to null (arrays stay arrays).
    const normalized = {};
    for (const [key, value] of Object.entries(extracted)) {
        normalized[key] = blankToNull(value);
    }

    return { topic, extracted: normalized };
}