// src/config/database.js
//
// Phase 6: MongoDB connection management.
//
// The app must run WITHOUT a database (Phase 1–5 demos, health checks) but be
// fully functional WITH one. So connecting is explicit and optional: callers
// decide when to connect, and failures are logged, not fatal.
//
// dotenv is loaded HERE so that ANY consumer of this module (the server, the
// db-demo script, future test scripts) sees the same MONGODB_URI without each
// remembering to call dotenv.config() themselves.

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'node:dns';

dotenv.config({ quiet: true });

// Some networks' DNS resolvers refuse SRV lookups, which Atlas needs
// (error: "querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net").
// Allow ops to point Node's resolver at servers that answer SRV records:
//   DNS_SERVERS=8.8.8.8,1.1.1.1
// When unset, the OS default resolver is used. Opt-in, never hardcoded.
function applyCustomDnsServers() {
    const raw = process.env.DNS_SERVERS;
    if (!raw) return;
    const servers = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (servers.length > 0) {
        dns.setServers(servers);
        console.log(`Using custom DNS servers: ${servers.join(', ')}`);
    }
}
applyCustomDnsServers();

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