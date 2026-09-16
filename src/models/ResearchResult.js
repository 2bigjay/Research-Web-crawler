// src/models/ResearchResult.js
//
// Phase 6: one document per cleaned, extracted page from a crawl.
//
// Schema thinking:
//  - `session` links every result to its CrawlSession run; indexed because
//    Phase 7 will list/filter results by session.
//  - `topic` and `url` are indexed too: the research API searches by topic and
//    pages should be unique per crawl (we dedupe before saving).
//  - `extracted` is Schema.Types.Mixed: research fields differ per topic
//    (robotics-companies has products/country, another topic won't). Mixed is
//    the honest choice here — forcing one shape would bury everything in blobs
//    and destroy phase 4's whole "add a topic freely" design.

import mongoose from 'mongoose';

const { Schema } = mongoose;

const resultSchema = new Schema(
    {
        session: { type: Schema.Types.ObjectId, ref: 'CrawlSession', index: true },
        topic: { type: String, default: null, index: true },
        url: { type: String, required: true, index: true },
        title: { type: String, default: '' },
        source: { type: String, default: '' }, // hostname — quick "who wrote this?"
        depth: { type: Number, default: 0 },
        status: { type: Number, default: 0 },  // HTTP status of the page
        content: { type: [String], default: [] }, // paragraph texts (searchable)
        extracted: { type: Schema.Types.Mixed, default: {} },
        crawledAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

// One page shouldn't be re-saved for the same crawl run more than once.
resultSchema.index({ session: 1, url: 1 }, { unique: true });

export default mongoose.model('ResearchResult', resultSchema);