// src/controllers/researchController.js
//
// Phase 7: HTTP glue for research results — list, search, single item,
// delete. Same rule as the crawler controller: parsing and shaping only.

import {
    getResearchResults,
    getResearchResult,
    deleteResearchResult,
    searchResearchResults
} from '../services/researchService.js';

// GET /api/research — list with optional filters, pagination, sort.
export async function listResults(req, res, next) {
    try {
        const { topic, source, session, sort, order } = req.query;
        // Validation guaranteed integer-ness; coerce so echoed pagination is clean.
        const limit = Number(req.query.limit) || 20;
        const skip = Number(req.query.skip) || 0;
        const result = await getResearchResults({
            limit,
            skip,
            topic,
            source,
            session,
            sort: sort ?? 'crawledAt',
            order: order ?? 'desc'
        });
        res.json({ success: true, data: result.data, total: result.total, limit, skip });
    } catch (error) {
        next(error);
    }
}

// GET /api/research/search?q=... — free-text search over the searchable fields.
export async function searchResults(req, res, next) {
    try {
        const { q } = req.query;
        const limit = Number(req.query.limit) || 20;
        const skip = Number(req.query.skip) || 0;
        const result = await searchResearchResults({ q, limit, skip });
        res.json({ success: true, data: result.data, total: result.total, limit, skip });
    } catch (error) {
        next(error);
    }
}

// GET /api/research/:id — one result.
export async function getResult(req, res, next) {
    try {
        const result = await getResearchResult(req.params.id);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Research result not found' });
        }
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/research/:id — remove one result.
export async function deleteResult(req, res, next) {
    try {
        const deleted = await deleteResearchResult(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Research result not found' });
        }
        res.status(204).end();
    } catch (error) {
        next(error);
    }
}