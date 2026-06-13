// src/lib/archiveService.ts
// Core archive engine — reads from Sanity, writes to MongoDB, deletes from Sanity

import { client as sanityClient, writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';
import { getArchiveDb, COLLECTIONS } from '@/lib/mongoClient';
import type { Db } from 'mongodb';

const ARCHIVE_DAYS = parseInt(process.env.ARCHIVE_DAYS_THRESHOLD || '90', 10);

export interface ArchiveRunResult {
    runId: string;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    archived: {
        dispatchLogs: number;
        purchaseOrders: number;
        goodsReceipts: number;
        internalTransfers: number;
        stockAdjustments: number;
        inventoryCounts: number;
        fileAttachments: number;
        stockSnapshots: number;
    };
    errors: string[];
    skipped: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCutoffDate(): string {
    const d = new Date();
    d.setDate(d.getDate() - ARCHIVE_DAYS);
    return d.toISOString();
}

/** Safely resolve a Sanity reference string */
function refId(val: any): string | null {
    if (!val) return null;
    if (typeof val === 'string') return val;
    return val._ref || val._id || null;
}

/** Remove Sanity-only metadata fields not needed in MongoDB */
function sanitizeForMongo(doc: any): any {
    const cleaned = { ...doc };
    delete cleaned._rev;       // Sanity revision (irrelevant in Mongo)
    delete cleaned._updatedAt; // Sanity internal update timestamp
    return cleaned;
}

// ─── Sequence Counter Management ──────────────────────────────────────────────

async function updateSequenceCounter(
    db: Db,
    type: string,
    prefix: string,
    numbers: string[]
): Promise<void> {
    let maxSeen = 0;
    for (const num of numbers) {
        if (num && num.startsWith(prefix + '-')) {
            const n = parseInt(num.split('-')[1], 10);
            if (!isNaN(n) && n > maxSeen) maxSeen = n;
        }
    }
    if (maxSeen === 0) return;

    await db.collection(COLLECTIONS.SEQUENCE_COUNTERS).updateOne(
        { type },
        { $max: { maxSeen }, $set: { prefix, updatedAt: new Date().toISOString() } },
        { upsert: true }
    );
}

export async function getMaxSequenceNumber(type: string): Promise<number> {
    const db = await getArchiveDb();
    const doc = await db.collection(COLLECTIONS.SEQUENCE_COUNTERS).findOne({ type });
    return doc?.maxSeen || 0;
}

// ─── Stock Baseline Snapshot ───────────────────────────────────────────────────

async function captureStockBaseline(db: Db): Promise<void> {
    try {
        const registry = await sanityClient.fetch(groq`*[_type == "stockRegistry"][0]{ stockData, lastUpdated }`);
        if (!registry?.stockData) {
            console.log('⚠️  No stockRegistry found — skipping baseline capture');
            return;
        }

        await db.collection(COLLECTIONS.STOCK_BASELINES).insertOne({
            capturedAt: new Date().toISOString(),
            cutoffDate: getCutoffDate(),
            stockData: registry.stockData,
            lastRegistryUpdate: registry.lastUpdated,
        });

        console.log('📸 Stock baseline captured before archival');
    } catch (err) {
        console.error('❌ Failed to capture stock baseline:', err);
        // Non-fatal — archival continues
    }
}

// ─── Sanity Asset Deletion ─────────────────────────────────────────────────────

async function deleteSanityAsset(assetId: string): Promise<void> {
    try {
        await writeClient.delete(assetId);
        console.log(`🗑️  Deleted Sanity asset: ${assetId}`);
    } catch (err: any) {
        // 404 is fine — asset already gone
        if (err?.statusCode !== 404) {
            console.error(`❌ Failed to delete Sanity asset ${assetId}:`, err?.message);
        }
    }
}

// ─── Per-type Archive Functions ────────────────────────────────────────────────

async function archiveDispatchLogs(db: Db, cutoff: string, errors: string[]): Promise<number> {
    const docs = await sanityClient.fetch(groq`
        *[_type == "DispatchLog"
            && dispatchDate < $cutoff
            && !(evidenceStatus in ["pending", "partial"])
        ] {
            _id, _type, _createdAt, dispatchNumber, dispatchDate, evidenceStatus, status,
            peopleFed, totalCost, costPerPerson, sellingPrice, totalSales, notes,
            "dispatchType": dispatchType->{_id, name, description, defaultTime, sellingPrice},
            "sourceSite": sourceSite->{_id, name, location, code},
            "dispatchedBy": dispatchedBy->{_id, name, email, role},
            "dispatchedItems": dispatchedItems[]{
                _key, dispatchedQuantity, unitPrice, totalCost, notes,
                "sourceBin": sourceBin->{_id, name, "site": site->{_id, name}},
                "stockItem": stockItem->{_id, name, sku, unitOfMeasure, "category": category->{_id, title}}
            },
            "attachments": attachments[]->{_id, fileName, fileType, description, uploadedAt,
                "file": file{"asset": asset->{_id, url, originalFilename, mimeType}}}
        }
    `, { cutoff });

    if (!docs.length) return 0;

    const numbers = docs.map((d: any) => d.dispatchNumber);
    await updateSequenceCounter(db, 'DispatchLog', 'DL', numbers);

    const toInsert = docs.map((d: any) => ({
        ...sanitizeForMongo(d),
        _sanityId: d._id,
        _isArchived: true,
        _archivedAt: new Date().toISOString(),
    }));

    await db.collection(COLLECTIONS.DISPATCH_LOGS).insertMany(toInsert);

    const ids = docs.map((d: any) => d._id);
    for (const id of ids) {
        try { await writeClient.delete(id); }
        catch (e: any) { errors.push(`Failed to delete DispatchLog ${id}: ${e?.message}`); }
    }

    console.log(`✅ Archived ${docs.length} DispatchLogs`);
    return docs.length;
}

async function archivePurchaseOrders(db: Db, cutoff: string, errors: string[]): Promise<number> {
    const docs = await sanityClient.fetch(groq`
        *[_type == "PurchaseOrder"
            && orderDate < $cutoff
            && !(status in ["draft", "pending-approval"])
        ] {
            _id, _type, _createdAt, poNumber, orderDate, status, totalAmount, notes,
            evidenceStatus, approvedAt,
            "site": site->{_id, name, location},
            "orderedBy": orderedBy->{_id, name, email},
            "approvedBy": approvedBy->{_id, name, email},
            "orderedItems": orderedItems[]{
                _key, orderedQuantity, unitPrice, totalPrice, priceManuallyUpdated,
                "stockItem": stockItem->{_id, name, sku, unitOfMeasure},
                "supplier": supplier->{_id, name, contactPerson, phoneNumber, email}
            },
            "attachments": attachments[]->{_id, fileName, fileType, description, uploadedAt,
                "file": file{"asset": asset->{_id, url, originalFilename, mimeType}}}
        }
    `, { cutoff });

    if (!docs.length) return 0;

    const numbers = docs.map((d: any) => d.poNumber);
    await updateSequenceCounter(db, 'PurchaseOrder', 'PO', numbers);

    const toInsert = docs.map((d: any) => ({
        ...sanitizeForMongo(d),
        _sanityId: d._id,
        _isArchived: true,
        _archivedAt: new Date().toISOString(),
    }));

    await db.collection(COLLECTIONS.PURCHASE_ORDERS).insertMany(toInsert);

    const ids = docs.map((d: any) => d._id);
    for (const id of ids) {
        try { await writeClient.delete(id); }
        catch (e: any) { errors.push(`Failed to delete PurchaseOrder ${id}: ${e?.message}`); }
    }

    console.log(`✅ Archived ${docs.length} PurchaseOrders`);
    return docs.length;
}

async function archiveGoodsReceipts(db: Db, cutoff: string, errors: string[]): Promise<number> {
    const docs = await sanityClient.fetch(groq`
        *[_type == "GoodsReceipt"
            && receiptDate < $cutoff
            && !(evidenceStatus in ["pending", "partial"])
        ] {
            _id, _type, _createdAt, receiptNumber, receiptDate, status, evidenceStatus, notes,
            completedAt,
            "purchaseOrder": purchaseOrder->{
                _id, poNumber, status, orderDate, totalAmount,
                "site": site->{_id, name, location},
                "orderedItems": orderedItems[]{
                    _key, orderedQuantity, unitPrice,
                    "stockItem": stockItem->{_id, name, sku},
                    "supplier": supplier->{_id, name}
                }
            },
            "receivedBy": receivedBy->{_id, name, email},
            "receivedItems": receivedItems[]{
                _key, orderedQuantity, receivedQuantity, batchNumber, expiryDate, condition,
                unitPrice, totalPrice,
                "receivingBin": receivingBin->{_id, name, binType, "site": site->{_id, name}},
                "stockItem": stockItem->{_id, name, sku, unitOfMeasure, "category": category->{_id, title}}
            },
            "attachments": attachments[]->{_id, fileName, fileType, description, uploadedAt,
                "file": file{"asset": asset->{_id, url, originalFilename, mimeType}}}
        }
    `, { cutoff });

    if (!docs.length) return 0;

    const numbers = docs.map((d: any) => d.receiptNumber);
    await updateSequenceCounter(db, 'GoodsReceipt', 'GR', numbers);

    const toInsert = docs.map((d: any) => ({
        ...sanitizeForMongo(d),
        _sanityId: d._id,
        _isArchived: true,
        _archivedAt: new Date().toISOString(),
    }));

    await db.collection(COLLECTIONS.GOODS_RECEIPTS).insertMany(toInsert);

    const ids = docs.map((d: any) => d._id);
    for (const id of ids) {
        try { await writeClient.delete(id); }
        catch (e: any) { errors.push(`Failed to delete GoodsReceipt ${id}: ${e?.message}`); }
    }

    console.log(`✅ Archived ${docs.length} GoodsReceipts`);
    return docs.length;
}

async function archiveInternalTransfers(db: Db, cutoff: string, errors: string[]): Promise<number> {
    const docs = await sanityClient.fetch(groq`
        *[_type == "InternalTransfer"
            && transferDate < $cutoff
            && !(status in ["draft", "pending-approval"])
        ] {
            _id, _type, _createdAt, transferNumber, transferDate, status, notes,
            approvedAt,
            "fromBin": fromBin->{_id, name, "site": site->{_id, name}},
            "toBin": toBin->{_id, name, "site": site->{_id, name}},
            "transferredBy": transferredBy->{_id, name, email},
            "approvedBy": approvedBy->{_id, name, email},
            "transferredItems": transferredItems[]{
                _key, transferredQuantity,
                "stockItem": stockItem->{_id, name, sku, unitOfMeasure}
            }
        }
    `, { cutoff });

    if (!docs.length) return 0;

    const numbers = docs.map((d: any) => d.transferNumber);
    await updateSequenceCounter(db, 'InternalTransfer', 'TRF', numbers);

    const toInsert = docs.map((d: any) => ({
        ...sanitizeForMongo(d),
        _sanityId: d._id,
        _isArchived: true,
        _archivedAt: new Date().toISOString(),
    }));

    await db.collection(COLLECTIONS.INTERNAL_TRANSFERS).insertMany(toInsert);

    const ids = docs.map((d: any) => d._id);
    for (const id of ids) {
        try { await writeClient.delete(id); }
        catch (e: any) { errors.push(`Failed to delete InternalTransfer ${id}: ${e?.message}`); }
    }

    console.log(`✅ Archived ${docs.length} InternalTransfers`);
    return docs.length;
}

async function archiveStockAdjustments(db: Db, cutoff: string, errors: string[]): Promise<number> {
    const docs = await sanityClient.fetch(groq`
        *[_type == "StockAdjustment"
            && adjustmentDate < $cutoff
            && !(evidenceStatus in ["pending", "partial"])
        ] {
            _id, _type, _createdAt, adjustmentNumber, adjustmentDate, adjustmentType,
            evidenceStatus, notes,
            "adjustedBy": adjustedBy->{_id, name, email},
            "bin": bin->{_id, name, "site": site->{_id, name}},
            "adjustedItems": adjustedItems[]{
                _key, adjustedQuantity, reason,
                "stockItem": stockItem->{_id, name, sku, unitOfMeasure}
            },
            "attachments": attachments[]->{_id, fileName, fileType, description, uploadedAt,
                "file": file{"asset": asset->{_id, url, originalFilename, mimeType}}}
        }
    `, { cutoff });

    if (!docs.length) return 0;

    const toInsert = docs.map((d: any) => ({
        ...sanitizeForMongo(d),
        _sanityId: d._id,
        _isArchived: true,
        _archivedAt: new Date().toISOString(),
    }));

    await db.collection(COLLECTIONS.STOCK_ADJUSTMENTS).insertMany(toInsert);

    const ids = docs.map((d: any) => d._id);
    for (const id of ids) {
        try { await writeClient.delete(id); }
        catch (e: any) { errors.push(`Failed to delete StockAdjustment ${id}: ${e?.message}`); }
    }

    console.log(`✅ Archived ${docs.length} StockAdjustments`);
    return docs.length;
}

async function archiveInventoryCounts(db: Db, cutoff: string, errors: string[]): Promise<number> {
    const docs = await sanityClient.fetch(groq`
        *[_type == "InventoryCount"
            && countDate < $cutoff
            && !(status in ["draft", "in-progress"])
        ] {
            _id, _type, _createdAt, countNumber, countDate, status, notes,
            "countedBy": countedBy->{_id, name, email},
            "bin": bin->{_id, name, "site": site->{_id, name}},
            "countedItems": countedItems[]{
                _key, countedQuantity, systemQuantityAtCountTime, variance,
                "stockItem": stockItem->{_id, name, sku, unitOfMeasure}
            }
        }
    `, { cutoff });

    if (!docs.length) return 0;

    const toInsert = docs.map((d: any) => ({
        ...sanitizeForMongo(d),
        _sanityId: d._id,
        _isArchived: true,
        _archivedAt: new Date().toISOString(),
    }));

    await db.collection(COLLECTIONS.INVENTORY_COUNTS).insertMany(toInsert);

    const ids = docs.map((d: any) => d._id);
    for (const id of ids) {
        try { await writeClient.delete(id); }
        catch (e: any) { errors.push(`Failed to delete InventoryCount ${id}: ${e?.message}`); }
    }

    console.log(`✅ Archived ${docs.length} InventoryCounts`);
    return docs.length;
}

async function archiveFileAttachments(db: Db, cutoff: string, errors: string[]): Promise<number> {
    const docs = await sanityClient.fetch(groq`
        *[_type == "FileAttachment" && uploadedAt < $cutoff] {
            _id, _type, _createdAt, fileName, fileType, uploadedAt, description, isArchived,
            "uploadedBy": uploadedBy->{_id, name, email},
            "relatedTo": relatedTo->{_id, _type},
            "file": file{"asset": asset->{_id, _type, url, originalFilename, mimeType, size}}
        }
    `, { cutoff });

    if (!docs.length) return 0;

    const toInsert = docs.map((d: any) => ({
        ...sanitizeForMongo(d),
        _sanityId: d._id,
        _isArchived: true,
        _archivedAt: new Date().toISOString(),
    }));

    await db.collection(COLLECTIONS.FILE_ATTACHMENTS).insertMany(toInsert);

    for (const doc of docs) {
        // Delete the Sanity asset first (the actual file)
        const assetId = doc.file?.asset?._id;
        if (assetId) {
            await deleteSanityAsset(assetId);
        }
        // Then delete the document
        try { await writeClient.delete(doc._id); }
        catch (e: any) { errors.push(`Failed to delete FileAttachment ${doc._id}: ${e?.message}`); }
    }

    console.log(`✅ Archived ${docs.length} FileAttachments`);
    return docs.length;
}

async function archiveStockSnapshots(db: Db, cutoff: string, errors: string[]): Promise<number> {
    const docs = await sanityClient.fetch(groq`
        *[_type == "stockSnapshot" && _createdAt < $cutoff] {
            _id, _type, _createdAt, quantity, lastUpdated,
            "stockItem": stockItem->{_id, name, sku},
            "bin": bin->{_id, name, "site": site->{_id, name}}
        }
    `, { cutoff });

    if (!docs.length) return 0;

    const toInsert = docs.map((d: any) => ({
        ...sanitizeForMongo(d),
        _sanityId: d._id,
        _isArchived: true,
        _archivedAt: new Date().toISOString(),
    }));

    await db.collection(COLLECTIONS.STOCK_SNAPSHOTS).insertMany(toInsert);

    const ids = docs.map((d: any) => d._id);
    for (const id of ids) {
        try { await writeClient.delete(id); }
        catch (e: any) { errors.push(`Failed to delete stockSnapshot ${id}: ${e?.message}`); }
    }

    console.log(`✅ Archived ${docs.length} StockSnapshots`);
    return docs.length;
}

// ─── Index Creation ────────────────────────────────────────────────────────────

async function ensureIndexes(db: Db): Promise<void> {
    try {
        await db.collection(COLLECTIONS.DISPATCH_LOGS).createIndex({ dispatchDate: -1 });
        await db.collection(COLLECTIONS.DISPATCH_LOGS).createIndex({ dispatchNumber: 1 }, { unique: true, sparse: true });
        await db.collection(COLLECTIONS.DISPATCH_LOGS).createIndex({ 'sourceSite._id': 1 });
        await db.collection(COLLECTIONS.DISPATCH_LOGS).createIndex({ _sanityId: 1 }, { unique: true });

        await db.collection(COLLECTIONS.PURCHASE_ORDERS).createIndex({ orderDate: -1 });
        await db.collection(COLLECTIONS.PURCHASE_ORDERS).createIndex({ poNumber: 1 }, { unique: true, sparse: true });
        await db.collection(COLLECTIONS.PURCHASE_ORDERS).createIndex({ 'site._id': 1 });
        await db.collection(COLLECTIONS.PURCHASE_ORDERS).createIndex({ _sanityId: 1 }, { unique: true });

        await db.collection(COLLECTIONS.GOODS_RECEIPTS).createIndex({ receiptDate: -1 });
        await db.collection(COLLECTIONS.GOODS_RECEIPTS).createIndex({ receiptNumber: 1 }, { unique: true, sparse: true });
        await db.collection(COLLECTIONS.GOODS_RECEIPTS).createIndex({ _sanityId: 1 }, { unique: true });

        await db.collection(COLLECTIONS.INTERNAL_TRANSFERS).createIndex({ transferDate: -1 });
        await db.collection(COLLECTIONS.INTERNAL_TRANSFERS).createIndex({ transferNumber: 1 }, { unique: true, sparse: true });
        await db.collection(COLLECTIONS.INTERNAL_TRANSFERS).createIndex({ _sanityId: 1 }, { unique: true });

        await db.collection(COLLECTIONS.STOCK_ADJUSTMENTS).createIndex({ adjustmentDate: -1 });
        await db.collection(COLLECTIONS.STOCK_ADJUSTMENTS).createIndex({ _sanityId: 1 }, { unique: true });

        await db.collection(COLLECTIONS.INVENTORY_COUNTS).createIndex({ countDate: -1 });
        await db.collection(COLLECTIONS.INVENTORY_COUNTS).createIndex({ _sanityId: 1 }, { unique: true });

        await db.collection(COLLECTIONS.FILE_ATTACHMENTS).createIndex({ uploadedAt: -1 });
        await db.collection(COLLECTIONS.FILE_ATTACHMENTS).createIndex({ _sanityId: 1 }, { unique: true });

        await db.collection(COLLECTIONS.ARCHIVE_RUNS).createIndex({ startedAt: -1 });
        await db.collection(COLLECTIONS.SEQUENCE_COUNTERS).createIndex({ type: 1 }, { unique: true });
        await db.collection(COLLECTIONS.STOCK_BASELINES).createIndex({ capturedAt: -1 });

        console.log('📋 MongoDB indexes ensured');
    } catch (err) {
        // Indexes already exist — non-fatal
        console.log('ℹ️  Index creation skipped (likely already exist)');
    }
}

// ─── Main Archive Runner ───────────────────────────────────────────────────────

export async function runArchive(): Promise<ArchiveRunResult> {
    const startedAt = new Date().toISOString();
    const runId = `archive-${Date.now()}`;
    const errors: string[] = [];

    console.log(`\n🗂️  Starting archive run: ${runId}`);
    console.log(`📅 Cutoff date: ${getCutoffDate()} (documents older than ${ARCHIVE_DAYS} days)`);

    const db = await getArchiveDb();
    await ensureIndexes(db);

    // Step 1: Capture stock baseline BEFORE any deletions
    await captureStockBaseline(db);

    const cutoff = getCutoffDate();

    // Step 2: Archive each document type
    const dispatchLogs = await archiveDispatchLogs(db, cutoff, errors).catch(e => { errors.push(`DispatchLog batch failed: ${e?.message}`); return 0; });
    const purchaseOrders = await archivePurchaseOrders(db, cutoff, errors).catch(e => { errors.push(`PurchaseOrder batch failed: ${e?.message}`); return 0; });
    const goodsReceipts = await archiveGoodsReceipts(db, cutoff, errors).catch(e => { errors.push(`GoodsReceipt batch failed: ${e?.message}`); return 0; });
    const internalTransfers = await archiveInternalTransfers(db, cutoff, errors).catch(e => { errors.push(`InternalTransfer batch failed: ${e?.message}`); return 0; });
    const stockAdjustments = await archiveStockAdjustments(db, cutoff, errors).catch(e => { errors.push(`StockAdjustment batch failed: ${e?.message}`); return 0; });
    const inventoryCounts = await archiveInventoryCounts(db, cutoff, errors).catch(e => { errors.push(`InventoryCount batch failed: ${e?.message}`); return 0; });
    const fileAttachments = await archiveFileAttachments(db, cutoff, errors).catch(e => { errors.push(`FileAttachment batch failed: ${e?.message}`); return 0; });
    const stockSnapshots = await archiveStockSnapshots(db, cutoff, errors).catch(e => { errors.push(`StockSnapshot batch failed: ${e?.message}`); return 0; });

    const completedAt = new Date().toISOString();
    const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

    const result: ArchiveRunResult = {
        runId,
        startedAt,
        completedAt,
        durationMs,
        archived: {
            dispatchLogs,
            purchaseOrders,
            goodsReceipts,
            internalTransfers,
            stockAdjustments,
            inventoryCounts,
            fileAttachments,
            stockSnapshots,
        },
        errors,
        skipped: 0,
    };

    // Step 3: Log the run
    await db.collection(COLLECTIONS.ARCHIVE_RUNS).insertOne(result);

    const totalArchived = Object.values(result.archived).reduce((a, b) => a + b, 0);
    console.log(`\n🎉 Archive run complete: ${totalArchived} documents archived in ${durationMs}ms`);
    if (errors.length) console.error(`⚠️  ${errors.length} errors occurred:`, errors);

    return result;
}
