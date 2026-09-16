// src/middlewares/rateLimiters.js
//
// Phase 8: rate limiting is a CORE part of "responsible crawling" — a crawler
// API that lets anyone blast target sites is a weapon. Two limiter tiers:
//
//  - apiLimiter: every /api request, generous, stops casual floods.
//  - crawlLimiter: POST /api/crawls specifically — that endpoint makes outbound
//    requests on the caller's behalf, so it gets a much tighter budget.
//
// Counters live in memory per IP. Fine for a single-instance dev/deploy; a
// multi-instance deployment would swap in a shared store (Redis) later.

import rateLimit from 'express-rate-limit';

const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 120;   // per minute
const CRAWL_RATE_LIMIT_MAX = Number(process.env.CRAWL_RATE_LIMIT_MAX) || 10;

function jsonLimiter(max, message) {
    return rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, message }
    });
}

export const apiLimiter = jsonLimiter(
    RATE_LIMIT_MAX,
    `Too many requests. Limit is ${RATE_LIMIT_MAX} per minute.`
);

export const crawlLimiter = jsonLimiter(
    CRAWL_RATE_LIMIT_MAX,
    `Too many crawl requests. Limit is ${CRAWL_RATE_LIMIT_MAX} per minute.`
);

// Comfortable defaults for automated checks; env-tunable in production.
export function limiterStateText() {
    return `api=${RATE_LIMIT_MAX}/min, crawls=${CRAWL_RATE_LIMIT_MAX}/min`;
}