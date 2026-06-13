// src/lib/mongoClient.ts
// MongoDB connection singleton for the archive system

import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URL || process.env.MONGODB_URI || '';
const dbName = process.env.DATABASE_NAME || process.env.MONGODB_DB_NAME || 'caterflow_archive';

// Global singleton to reuse across serverless function invocations
let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

declare global {
    // Prevent TypeScript from complaining about the global
    var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (uri) {
    if (process.env.NODE_ENV === 'development') {
        if (!global._mongoClientPromise) {
            client = new MongoClient(uri);
            global._mongoClientPromise = client.connect();
        }
        clientPromise = global._mongoClientPromise!;
    } else {
        client = new MongoClient(uri);
        clientPromise = client.connect();
    }
}

export default clientPromise;

/**
 * Get the archive database instance
 */
export async function getArchiveDb(): Promise<Db> {
    if (!uri || !clientPromise) {
        throw new Error('Please define the MONGODB_URI environment variable');
    }
    const mongoClient = await clientPromise;
    return mongoClient.db(dbName);
}

/**
 * Collection name constants
 */
export const COLLECTIONS = {
    DISPATCH_LOGS: 'archived_dispatch_logs',
    PURCHASE_ORDERS: 'archived_purchase_orders',
    GOODS_RECEIPTS: 'archived_goods_receipts',
    INTERNAL_TRANSFERS: 'archived_internal_transfers',
    STOCK_ADJUSTMENTS: 'archived_stock_adjustments',
    INVENTORY_COUNTS: 'archived_inventory_counts',
    FILE_ATTACHMENTS: 'archived_file_attachments',
    STOCK_SNAPSHOTS: 'archived_stock_snapshots',
    ARCHIVE_RUNS: 'archive_runs',
    SEQUENCE_COUNTERS: 'sequence_counters',
    STOCK_BASELINES: 'stock_baselines',
} as const;

export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];
