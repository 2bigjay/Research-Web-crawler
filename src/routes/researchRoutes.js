// src/routes/researchRoutes.js
//
// Phase 7: research result endpoints. NOTE: `/search` is registered BEFORE
// `/:id` so the literal path "search" is never mistaken for an ObjectId.

import { Router } from 'express';
import { query, param } from 'express-validator';
import { listResults, searchResults, getResult, deleteResult } from '../controllers/researchController.js';
import { validate } from '../middlewares/validationMiddleware.js';
import { requireApiKey } from '../middlewares/authMiddleware.js';

const router = Router();

const paginationRules = [
    query('limit')
        .optional({ values: 'falsy' })
        .isInt({ min: 1, max: 100 })
        .withMessage('limit must be an integer between 1 and 100')
        .toInt(),
    query('skip')
        .optional({ values: 'falsy' })
        .isInt({ min: 0 })
        .withMessage('skip must be a non-negative integer')
        .toInt()
];

router.get('/search', [
    query('q')
        .trim()
        .notEmpty()
        .withMessage('q (search text) is required')
        .isLength({ min: 2 })
        .withMessage('q must be at least 2 characters'),
    ...paginationRules
], validate, searchResults);

router.get('/', [
    ...paginationRules,
    query('topic')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 100 })
        .withMessage('topic is too long'),
    query('session')
        .optional({ values: 'falsy' })
        .isMongoId()
        .withMessage('session must be a valid MongoDB ObjectId'),
    query('source')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 200 })
        .withMessage('source is too long'),
    query('sort')
        .optional({ values: 'falsy' })
        .isIn(['crawledAt', 'createdAt', 'title', 'source', 'depth'])
        .withMessage('sort must be one of: crawledAt, createdAt, title, source, depth'),
    query('order')
        .optional({ values: 'falsy' })
        .isIn(['asc', 'desc'])
        .withMessage('order must be "asc" or "desc"')
], validate, listResults);

router.get('/:id', [
    param('id').isMongoId().withMessage('id must be a valid MongoDB ObjectId')
], validate, getResult);

// Writes (deleting a result) are protected when API_KEY auth is enabled.
router.delete('/:id', requireApiKey, [
    param('id').isMongoId().withMessage('id must be a valid MongoDB ObjectId')
], validate, deleteResult);

export default router;