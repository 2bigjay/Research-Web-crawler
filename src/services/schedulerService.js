// src/services/schedulerService.js
//
// Phase 9: scheduled, recurring crawls via node-cron.
//
// Env config (all optional — unset = scheduler disabled):
//   CRAWL_SCHEDULE        cron expression (e.g. "0 2 * * *" = nightly at 02:00)
//   SCHEDULED_START_URLS  comma-separated list of sites to re-research
//   SCHEDULED_TOPIC       topic used for extraction (default: robotics-companies)
//   SCHEDULED_MAX_PAGES   page cap for scheduled runs (default: 10)
//
// Runs re-use the same background queue as the API (enqueueCrawlJob), so a
// scheduled run can never compete with the request flow for politeness budget.

import cron from 'node-cron';
import { createCrawlSession, getCrawlSession } from './researchService.js';
import { enqueueCrawlJob } from './jobQueue.js';
import { DEFAULT_MAX_PAGES } from './crawlerService.js';

const DEFAULT_SCHEDULED_TOPIC = 'robotics-companies';

// Human-readable log so operators can see what was scheduled and why.
export function schedulerConfig() {
    const urls = (process.env.SCHEDULED_START_URLS ?? '')
        .split(',')
        .map((url) => url.trim())
        .filter(Boolean);
    return {
        enabled: Boolean(process.env.CRAWL_SCHEDULE && urls.length > 0),
        schedule: process.env.CRAWL_SCHEDULE ?? null,
        urls,
        topic: process.env.SCHEDULED_TOPIC ?? DEFAULT_SCHEDULED_TOPIC,
        maxPages: Number(process.env.SCHEDULED_MAX_PAGES) || Math.min(DEFAULT_MAX_PAGES, 10),
        lastRun: null,
        lastError: null
    };
}

// The actual run: one enqueued crawl per configured start URL. Exported so it
// can be verified directly (and reused by a CLI) without waiting for cron.
export async function runScheduledCrawls(state = schedulerConfig()) {
    state.lastRun = new Date();
    const runs = [];
    for (const url of state.urls) {
        try {
            const session = await createCrawlSession({
                startUrl: url,
                topic: state.topic,
                config: { maxPages: state.maxPages },
                runType: 'scheduled'
            });
            enqueueCrawlJob({
                sessionId: session._id,
                startUrl: url,
                topic: state.topic,
                config: { maxPages: state.maxPages },
                createdBy: 'scheduler'
            });
            runs.push({ url, status: 'QUEUED', sessionId: session._id });
        } catch (error) {
            state.lastError = error.message;
            runs.push({ url, status: 'FAILED', error: error.message });
        }
    }
    return runs;
}

let scheduledTask = null;

// Boot-time hook: registers the recurring job (if configured) and returns the
// active scheduler state for health reporting.
export function startScheduler() {
    const state = schedulerConfig();
    if (!state.enabled) {
        console.log('Scheduler disabled (set CRAWL_SCHEDULE and SCHEDULED_START_URLS to enable).');
        return state;
    }

    scheduledTask = cron.schedule(state.schedule, () => {
        console.log(`[scheduler] running scheduled crawls at ${new Date().toISOString()}`);
        runScheduledCrawls(state).catch((error) => {
            state.lastError = error.message;
            console.error('[scheduler] run failed:', error.message);
        });
    });

    console.log(`[scheduler] enabled: schedule="${state.schedule}", urls=[${state.urls.join(', ')}], topic=${state.topic}, maxPages=${state.maxPages}`);
    return state;
}

export function stopScheduler() {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
    }
}