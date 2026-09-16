// src/middlewares/errorMiddleware.js
//
// Phase 7: moves the 404 and central error handlers out of server.js so they
// live with the rest of the HTTP machinery. The error handler translates
// known failure shapes (bad ids, validation, duplicates, missing DB) into
// honest status codes instead of a blanket 500.

// eslint-disable-next-line no-unused-vars
export function notFound(req, res) {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`
    });
}

// Express recognizes a middleware with 4 parameters as an error handler and
// forwards errors here automatically. `next` is required for that signature.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
    // A controller can set err.status to signal its own status code.
    const status = err.status || 500;

    // Malformed MongoDB identifier (bad ObjectId in a URL path).
    if (err.name === 'CastError') {
        return res.status(400).json({ success: false, message: 'Invalid identifier' });
    }

    // Mongoose schema validation failed on an operation we didn't pre-check.
    if (err.name === 'ValidationError') {
        return res.status(400).json({ success: false, message: 'Invalid data' });
    }

    // Duplicate unique index (e.g. saving the same page twice for a session).
    if (err.code === 11000) {
        return res.status(409).json({ success: false, message: 'Duplicate entry not allowed' });
    }

    // The app runs DB-less on purpose (Phase 6); persistence endpoints should
    // say so clearly instead of masking it as a generic 500.
    if (String(err.message).includes('Database not connected')) {
        return res.status(503).json({ success: false, message: 'Database not connected. Try again later.' });
    }

    console.error('Unhandled error:', err);
    return res.status(status).json({
        success: false,
        message: status === 500 ? 'Internal server error' : err.message
    });
}