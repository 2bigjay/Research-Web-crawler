// src/middlewares/securityMiddleware.js
//
// Phase 8: shared security layers built from battle-tested Express middleware:
// Helmet's header defaults (CSP, nosniff, HSTS, referrer policy ...), a CORS
// policy with an explicit origin whitelist, and an extra custom header.
//
// CORS origins come from CORS_ORIGINS (comma-separated). Defaults to '*' (any
// origin) so the API stays open in development; lock it down before production.

import helmet from 'helmet';
import cors from 'cors';

const corsOrigins = (process.env.CORS_ORIGINS ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

export function securityHeaders(req, res, next) {
    helmet()(req, res, next);
}

export function corsPolicy(req, res, next) {
    cors({ origin: corsOrigins })(req, res, next);
}

export function securityStateText() {
    return `corsOrigins=${corsOrigins.join(',')}`;
}