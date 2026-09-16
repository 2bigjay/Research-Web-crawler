// src/config/database.js
//
// Phase 6: MongoDB connection management.
//
// The app must run WITHOUT a database (Phase 1–5 demos, health checks) but be
// fully functional WITH one. So connecting is explicit and optional: callers
// decide when to connect, and failures are logged, not fatal.

import mongoose from 'mongoose';

export const DEFAULT_MONGODB_URI = 'mongodb://127.0.0.1:27017/research_crawler';

export function getMongoUri() {
    return process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
}

// Connect to MongoDB. A short serverSelectionTimeoutMS (5s) stops startup from
// hanging when Atlas is unreachable, and we surface the error to the caller
// instead of letting Mongoose retry silently into the void.
export async function connectDatabase() {
    await mongoose.connect(getMongoUri(), {
        serverSelectionTimeoutMS: 5000
    });
    return mongoose.connection;
}

export async function disconnectDatabase() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
}

// readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
export function isDatabaseConnected() {
    return mongoose.connection.readyState === 1;
}

export function databaseStatusText() {
    const states = [
        'disconnected',
        'connected',
        'connecting',
        'disconnecting'
    ];
    return states[mongoose.connection.readyState] ?? 'unknown';
}