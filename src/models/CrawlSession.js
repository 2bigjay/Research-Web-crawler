// src/models/CrawlSession.js
//
// Phase 6: one document per crawl run. Aggregates the crawl's context and
// outcome; individual pages live in ResearchResult, linked by `session`.
//
// Schema thinking:
//  - SUMMARY-like numbers live here so a session is queryable WITHOUT loading
//    every page document ("how many pages did yesterday's crawls cover?").
//  - `errors` is an array of subdocuments, not a separate collection — it is
//    only ever read alongside the session.
//  - `status` is a constrained enum so statuses stay comparable/queryable.

import mongoose from 'mongoose';

const { Schema } = mongoose;

const errorSchema = new Schema(
    {
        url: { type: String, required: true },
        kind: { type: String, default: 'FETCH' },
        message: { type: String, default: '' }
    },
    { _id: false } // errors are children of the session, never referenced alone
);

const sessionSchema = new Schema(
    {
        startUrl: { type: String, required: true },
        topic: { type: String, default: null },
        status: {
            type: String,
            enum: ['RUNNING', 'COMPLETED', 'FAILED'],
            default: 'RUNNING'
        },
        // The limits that were actually in force (already resolved from
        // options/env/defaults by the crawler) — history remembers settings.
        config: {
            maxPages: { type: Number },
            maxDepth: { type: Number },
            requestDelayMs: { type: Number },
            timeoutMs: { type: Number }
        },
        summary: {
            pagesPlanned: { type: Number, default: 0 },
            pagesCrawled: { type: Number, default: 0 },
            nonHtmlSkipped: { type: Number, default: 0 },
            errors: { type: Number, default: 0 }
        },
        // Named crawlErrors, NOT "errors": Mongoose reserves "errors" for its
        // own validation error map — shadowing it can cause subtle breakage.
        crawlErrors: { type: [errorSchema], default: [] },
        startTime: { type: Date, default: Date.now },
        endTime: { type: Date, default: null },
        // Phase 9: how the run was started — API (sync/async) or scheduler.
        runType: {
            type: String,
            enum: ['manual', 'scheduled', 'sync'],
            default: 'manual'
        },
        // Phase 9: when a run FAILS, a short human-readable reason here.
        failure: { type: String, default: null }
    },
    { timestamps: true }
);

export default mongoose.model('CrawlSession', sessionSchema);