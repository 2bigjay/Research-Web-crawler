// src/server.js
// Entry point for the Research Web Crawler & API.

import express from 'express';
import dotenv from 'dotenv';
import { connectDatabase, databaseStatusText } from './config/database.js';
import { notFound, errorHandler } from './middlewares/errorMiddleware.js';
import { apiLimiter, crawlLimiter, limiterStateText } from './middlewares/rateLimiters.js';
import { securityHeaders, corsPolicy, securityStateText } from './middlewares/securityMiddleware.js';
import { authStateText } from './middlewares/authMiddleware.js';
import { startScheduler, schedulerConfig } from './services/schedulerService.js';
import crawlerRoutes from './routes/crawlerRoutes.js';
import researchRoutes from './routes/researchRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import './services/extractors/index.js'; // register research topic extractors

// Load variables from the .env file into process.env.
// This must be one of the first things we do, because everything below it
// may read settings like process.env.PORT.
dotenv.config({ quiet: true });

const app = express();

// Parse incoming JSON request bodies.
app.use(express.json());

// Phase 8: security layers apply to every request (before routes).
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(corsPolicy);

// Health check — confirms the API is running and responding.
// Kept OUT of the rate limiter so monitoring probes are never throttled.
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'Research Web Crawler & API is running',
        database: databaseStatusText(),
        security: {
            rateLimits: limiterStateText(),
            cors: securityStateText(),
            auth: authStateText()
        },
        automation: {
            scheduler: schedulerConfig()
        },
        timestamp: new Date().toISOString()
    });
});

// Phase 7: the research REST API.
// Every /api request is rate limited; crawls get a tighter extra budget (they
// make outbound requests on the caller's behalf). Write routes carry their own
// requireApiKey guard when auth is enabled (Phase 8).
app.use('/api/crawls', apiLimiter, crawlLimiter, crawlerRoutes);
app.use('/api/research', apiLimiter, researchRoutes);
app.use('/api/jobs', apiLimiter, jobRoutes);

// 404 handler — runs when no other route matched the request.
app.use(notFound);

// Central error handler.
app.use(errorHandler);

// Port comes from the environment so it can differ between local dev,
// testing, and production without touching code.
const PORT = process.env.PORT || 4000;

// Phase 6: try to connect to MongoDB only when configured. The server must
// still boot without a database (health checks and Phase 1–5 demos work fine),
// so a missing or failing connection is a warning, not a crash.
// Phase 9: the scheduler is started once connected — it needs the DB.
if (process.env.MONGODB_URI) {
    connectDatabase()
        .then(() => {
            console.log(`Connected to MongoDB (${databaseStatusText()})`);
            startScheduler();
        })
        .catch((error) => console.warn(`MongoDB connection failed: ${error.message}`));
} else {
    console.warn('MONGODB_URI not set — running without a database. Set it in .env to enable persistence.');
}

app.listen(PORT, () => {
    console.log(`Research Web Crawler & API listening on http://localhost:${PORT}`);
});