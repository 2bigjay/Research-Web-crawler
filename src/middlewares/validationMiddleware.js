// src/middlewares/validationMiddleware.js
//
// Phase 7: runs the express-validator rules declared on a route and turns any
// failures into a consistent 400 response. Routes stay self-documenting (the
// rules read like a spec) and controllers never see malformed input.

import { validationResult } from 'express-validator';

export function validate(req, res, next) {
    const result = validationResult(req);
    if (result.isEmpty()) {
        return next();
    }
    return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: result.array().map((error) => ({
            field: error.path,
            value: error.value,
            message: error.msg
        }))
    });
}