// src/routes/crawlerRoutes.js
//
// Phase 7: crawler endpoints. Each route declares its own input rules with
// express-validator so the chain reads like a spec; `validate` runs them.

import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { startCrawl, listCrawls, getCrawl } from '../controllers/crawlerController.js';
import { validate } from '../middlewares/validationMiddleware.js';
import { requireApiKey } from '../middlewares/authMiddleware.js';
import { getTopics } from '../services/extractionService.js';

const router = Router();

// Writes (starting a crawl) are protected when API_KEY auth is enabled.
router.post('/', requireApiKey, [
    body('startUrl')
        .trim()
        .notEmpty()
        .withMessage('startUrl is required')
        .bail()
        .isURL({ protocols: ['http', 'https'], require_protocol: true })
        .withMessage('startUrl must be a valid http(s) URL'),
    body('topic')
        .optional({ values: 'falsy' })
        .trim()
        .isIn(getTopics())
        .withMessage(`topic must be one of: ${getTopics().join(', ')}`),
    body('maxPages')
        .optional({ values: 'falsy' })
        .isInt({ min: 1, max: 50 })
        .withMessage('maxPages must be an integer between 1 and 50')
        .toInt(),
    body('maxDepth')
        .optional({ values: 'falsy' })
        .isInt({ min: 0, max: 3 })
        .withMessage('maxDepth must be an integer between 0 and 3')
        .toInt(),
    body('requestDelayMs')
        .optional({ values: 'falsy' })
        .isInt({ min: 250, max: 60000 })
        .withMessage('requestDelayMs must be an integer between 250 and 60000')
        .toInt(),
    body('timeoutMs')
        .optional({ values: 'falsy' })
        .isInt({ min: 1000, max: 120000 })
        .withMessage('timeoutMs must be an integer between 1000 and 120000')
        .toInt(),
    body('sync')
        .optional({ values: 'falsy' })
        .isBoolean()
        .withMessage('sync must be true or false')
        .toBoolean()
], validate, startCrawl);

// GET /api/crawls — list sessions, newest first, with pagination.
router.get('/', [
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
], validate, listCrawls);

router.get('/:id', [
    param('id').isMongoId().withMessage('id must be a valid MongoDB ObjectId')
], validate, getCrawl);

export default router;