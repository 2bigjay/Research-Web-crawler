// src/middlewares/authMiddleware.js
//
// Phase 8: simple API-key auth for WRITE endpoints (crawls + result deletion).
// Reads stay public — that half of the API is a research read shop.
//
// Opt-in by design: when API_KEY is unset, the API behaves exactly as before
// (no auth). Set API_KEY in .env and every write against it is denied with 401
// unless the caller sends "x-api-key: <key>". This keeps development friction
// at zero while making production locking trivially easy.

export function requireApiKey(req, res, next) {
    const expected = process.env.API_KEY;
    if (!expected) {
        return next(); // auth not enabled — open mode
    }
    const provided = req.header('x-api-key');
    if (provided && provided === expected) {
        return next();
    }
    return res.status(401).json({
        success: false,
        message: 'A valid x-api-key header is required for this operation.'
    });
}

export function authStateText() {
    return process.env.API_KEY ? 'api-key required (writes)' : 'disabled (open)';
}