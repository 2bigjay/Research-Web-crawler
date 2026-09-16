// src/server.js
// Entry point for the Research Web Crawler & API.

import express from 'express';
import dotenv from 'dotenv';
import { connectDatabase, databaseStatusText } from './config/database.js';
import { notFound, errorHandler } from './middlewares/errorMiddleware.js';
import crawlerRoutes from './routes/crawlerRoutes.js';
import researchRoutes from './routes/researchRoutes.js';
import './services/extractors/index.js'; // register research topic extractors

// Load variables from the .env file into process.env.
// This must be one of the first things we do, because everything below it
// may read settings like process.env.PORT.
dotenv.config({ quiet: true });

const app = express();

// Parse incoming JSON request bodies.
app.use(express.json());

// Health check — confirms the API is running and responding.
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'Research Web Crawler & API is running',
        database: databaseStatusText(),
        timestamp: new Date().toISOString()
    });
});

// Phase 7: the research REST API.
app.use('/api/crawls', crawlerRoutes);
app.use('/api/research', researchRoutes);

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