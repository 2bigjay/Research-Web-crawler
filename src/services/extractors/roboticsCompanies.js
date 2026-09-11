// src/services/extractors/roboticsCompanies.js
//
// Topic: "robotics-companies"
// Research item: a robotics company (name, description, products, country,
// website, and the pages worth visiting for more detail).
//
// Everything here is HEURISTIC — hand-written rules, not AI (that is Phase 10).
// The rules are intentionally conservative: low confidence returns null rather
// than a confident-looking guess.

// Common "About/Product" words used to pick the pages most worth following.
const RELEVANT_LINK_PATTERN = /about|contact|products?|solutions?|company|team|catalogue/i;

// Titles are usually "CompanyName | Tagline" or "CompanyName - subtitle".
// Take the first meaningful token before a common delimiter.
function nameFromTitle(title) {
    const first = title.split(/\s*[|–—-]\s*/)[0]?.trim();
    return first && first.length > 1 ? first : null;
}

// The description comes from the meta tag; when absent, fall back to the
// first substantial paragraph (meta is optional — Phase 2 saw Wikipedia
// ship none at all).
function findDescription(page) {
    if (page.metaDescription) return page.metaDescription;
    return page.paragraphs.find((p) => p.length > 120) ?? null;
}

// Product hints only count when the page actually announces a product-ish
// section. Without that heading, list items are probably navigation noise.
const PRODUCT_SECTION = /products?|solutions?|offerings?|portfolio|catalogue|robots?/i;

function findProducts(page) {
    const hasProductSection = page.headings.some((h) => PRODUCT_SECTION.test(h.text));
    if (!hasProductSection) return null;
    const items = page.listItems.slice(0, 12);
    return items.length > 0 ? items : null;
}

// Countries the heuristics can recognize. Deliberately a short whitelist:
// a wrong guess is worse than no guess.
const COUNTRIES = new Set([
    'Denmark', 'Germany', 'France', 'Italy', 'Spain', 'Sweden', 'Norway',
    'Finland', 'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Poland',
    'Czechia', 'Japan', 'China', 'South Korea', 'Korea', 'Taiwan', 'Singapore',
    'India', 'United States', 'USA', 'Canada', 'Mexico', 'Brazil', 'Argentina',
    'Australia', 'New Zealand', 'Taiwan', 'Israel', 'United Kingdom', 'UK'
]);

// Country guessing is the least reliable heuristic. A mention near location
// words ("HQ", "based in", "located in") is trusted; a bare mention is not.
function findCountry(page) {
    const text = [...page.paragraphs, ...page.listItems].join(' ');
    const locator = text.match(/\b(?:based in|located in|HQ in|headquartered in|from)\s+([A-Za-z ]{2,25}?)(?:\.|,|\b)/i);
    if (locator) {
        const candidate = locator[1].trim();
        for (const country of COUNTRIES) {
            // case-insensitive contains check within the captured phrase
            if (candidate.toLowerCase().includes(country.toLowerCase())) return country;
        }
    }
    return null;
}

export function extract(page) {
    return {
        companyName: page.siteName || nameFromTitle(page.title || '') || null,
        description: findDescription(page),
        products: findProducts(page),
        country: findCountry(page),
        website: page.canonical || page.url || null,
        relevantLinks: page.links
            .filter((l) => RELEVANT_LINK_PATTERN.test(l.href) || RELEVANT_LINK_PATTERN.test(l.text))
            .slice(0, 8)
            .map((l) => ({ href: l.href, text: l.text || '(no text)' }))
    };
}