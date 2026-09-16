// src/server.js
// Entry point for the Research Web Crawler & API.
//
// Phase 0 scope: a minimal Express server with a health check.
// Nothing else yet — crawler, database, API routes arrive in later phases.

import express from 'express';
import dotenv from 'dotenv';
import { connectDatabase, databaseStatusText } from './config/database.js';

// Load variables from the .env file into process.env.
// This must be one of the first things we do, because everything below it
// may read settings like process.env.PORT.
dotenv.config();

const app = express();

// Parse incoming JSON request bodies. The health check does not send a body,
// but this becomes necessary the moment clients start POSTing JSON to us.
app.use(express.json());

// Health check — confirms the API is running and responding.
// Used by humans, monitoring tools, and later by deployment platforms.
// Also reports database state so health reflects the whole system.
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'Research Web Crawler & API is running',
        database: databaseStatusText(),
        timestamp: new Date().toISOString()
    });
});

// 404 handler — runs when no other route matched the request.
// Returning JSON keeps the API's responses consistent.
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`
    });
});

// Central error handler. Express recognizes a middleware with 4 parameters
// as an error handler and forwards errors here automatically.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// Port comes from the environment so it can differ between local dev,
// testing, and production without touching code.
const PORT = process.env.PORT || 4000;

// Phase 6: try to connect to MongoDB only when configured. The server must
// still boot without a database (health checks and Phase 1–5 demos work fine),
// so a missing or failing connection is a warning, not a crash.
if (process.env.MONGODB_URI) {
    connectDatabase()
        .then(() => console.log(`Connected to MongoDB (${databaseStatusText()})`))
        .catch((error) => console.warn(`MongoDB connection failed: ${error.message}`));
} else {
    console.warn('MONGODB_URI not set — running without a database. Set it in .env to enable persistence.');
}

app.listen(PORT, () => {
    console.log(`Research Web Crawler & API listening on http://localhost:${PORT}`);
});