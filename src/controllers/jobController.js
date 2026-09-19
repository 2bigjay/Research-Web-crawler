// src/controllers/jobController.js
//
// Phase 9: HTTP glue for the in-memory background job queue. Jobs exist only
// for this process's lifetime (their crawl sessions persist in the DB), so
// these handlers are thin look-ups into jobQueue.

import { getJob, listJobs } from '../services/jobQueue.js';

// GET /api/jobs — recent background jobs (newest-in-memory first).
export async function listJobsHandler(req, res, next) {
    try {
        const limit = Number(req.query.limit) || 20;
        res.json({ success: true, data: listJobs({ limit }), limit });
    } catch (error) {
        next(error);
    }
}

// GET /api/jobs/:id — status of one background job.
export async function getJobHandler(req, res, next) {
    try {
        const job = getJob(req.params.id);
        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found. The job registry is in-memory and resets on restart — the crawl session persists in the DB.'
            });
        }
        res.json({ success: true, data: job });
    } catch (error) {
        next(error);
    }
}