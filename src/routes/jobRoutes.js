// src/routes/jobRoutes.js
//
// Phase 9: visibility into the in-memory background job queue. Job ids are
// UUIDs (not ObjectIds), so these routes carry no mongo-id validation.

import { Router } from 'express';
import { query } from 'express-validator';
import { listJobsHandler, getJobHandler } from '../controllers/jobController.js';
import { validate } from '../middlewares/validationMiddleware.js';

const router = Router();

router.get('/', [
    query('limit')
        .optional({ values: 'falsy' })
        .isInt({ min: 1, max: 100 })
        .withMessage('limit must be an integer between 1 and 100')
        .toInt()
], validate, listJobsHandler);

router.get('/:id', validate, getJobHandler);

export default router;