import { client as sanityClient, writeClient } from "@/lib/sanity";
import { groq } from "next-sanity";
import { getArchiveDb, COLLECTIONS } from "@/lib/mongoClient";
import type { Db } from "mongodb";

const ARCHIVE_DAYS = parseInt(process.env.ARCHIVE_DAYS_THRESHOLD || "90", 10);

export interface ArchiveStepResult {
  name: string;
  count: number;
  deletedCount: number;
  inserted?: number;
  skipped?: number;
  status: "success" | "partial" | "failed";
  errors: string[];
  warnings: string[];
  assetsDeleted?: number;
  message?: string;
}

export interface ArchiveRunResult {
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  archived: Record<string, number>;
  errors: string[];
  skipped: number;
  totalInserted?: number;
  totalSkipped?: number;
  steps: ArchiveStepResult[];
  assetsDeleted: number;
  incomplete?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createArchiveStepResult(options: {
  name: string;
  count: number;
  deletedCount: number;
  errors?: string[];
  warnings?: string[];
  assetsDeleted?: number;
  message?: string;
  inserted?: number;
  skipped?: number;
}): ArchiveStepResult {
  return {
    name: options.name,
    count: options.count,
    deletedCount: options.deletedCount,
    status: options.errors && options.errors.length ? "partial" : "success",
    errors: options.errors || [],
    warnings: options.warnings || [],
    assetsDeleted: options.assetsDeleted || 0,
    inserted: options.inserted || 0,
    skipped: options.skipped || 0,
    message: options.message,
  };
}

function getCutoffDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - ARCHIVE_DAYS);
  return d.toISOString();
}

/** Safely resolve a Sanity reference string */
function refId(val: any): string | null {
  if (!val) return null;
  if (typeof val === "string") return val;
  return val._ref || val._id || null;
}

/** Remove Sanity-only metadata fields not needed in MongoDB */
function sanitizeForMongo(doc: any): any {
  const cleaned = { ...doc };
  delete cleaned._rev; // Sanity revision (irrelevant in Mongo)
  delete cleaned._updatedAt; // Sanity internal update timestamp
  delete cleaned._id; // Preserve original ID separately as _sanityId
  return cleaned;
}

function normalizeForComparison(value: any): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForComparison(item));
  }
  if (typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = normalizeForComparison(value[key]);
          return acc;
        },
        {} as Record<string, any>,
      );
  }
  return value;
}

function stableSerialize(value: any): string {
  return JSON.stringify(normalizeForComparison(value));
}

function buildArchivedDocumentPayload(doc: any): any {
  return {
    ...sanitizeForMongo(doc),
    _sanityId: doc._id,
    _isArchived: true,
  };
}

/**
 * Sync Sanity documents into Mongo using _sanityId as the identity key.
 * New documents are inserted, existing documents with changed content are updated,
 * and unchanged documents are skipped.
 */
async function insertIfNotExists(
  db: Db,
  collectionName: string,
  docs: any[],
  errors: string[],
): Promise<{ inserted: number; skipped: number }> {
  if (!docs.length) return { inserted: 0, skipped: 0 };

  const collection = db.collection(collectionName);
  let inserted = 0;
  let skipped = 0;

  for (const doc of docs) {
    const payload = buildArchivedDocumentPayload(doc);
    const existing = await collection.findOne({ _sanityId: payload._sanityId });

    if (!existing) {
      await collection.insertOne({
        ...payload,
        _archivedAt: new Date().toISOString(),
      });
      inserted += 1;
      continue;
    }

    const existingComparable = { ...existing };
    const payloadComparable = { ...payload };
    delete (existingComparable as any)._id;
    delete (existingComparable as any)._archivedAt;
    delete (existingComparable as any)._lastSyncedAt;
    delete (payloadComparable as any)._archivedAt;
    delete (payloadComparable as any)._lastSyncedAt;

    if (
      stableSerialize(existingComparable) === stableSerialize(payloadComparable)
    ) {
      skipped += 1;
      continue;
    }

    await collection.replaceOne(
      { _sanityId: payload._sanityId },
      {
        ...payload,
        _archivedAt: new Date().toISOString(),
        _lastSyncedAt: new Date().toISOString(),
      },
      { upsert: true },
    );
    inserted += 1;
  }

  return { inserted, skipped };
}

// ─── Sequence Counter Management ──────────────────────────────────────────────

async function updateSequenceCounter(
  db: Db,
  type: string,
  prefix: string,
  numbers: string[],
): Promise<void> {
  let maxSeen = 0;
  for (const num of numbers) {
    if (num && num.startsWith(prefix + "-")) {
      const n = parseInt(num.split("-")[1], 10);
      if (!isNaN(n) && n > maxSeen) maxSeen = n;
    }
  }
  if (maxSeen === 0) return;

  await db.collection(COLLECTIONS.SEQUENCE_COUNTERS).updateOne(
    { type },
    {
      $max: { maxSeen },
      $set: { prefix, updatedAt: new Date().toISOString() },
    },
    { upsert: true },
  );
}

export async function getMaxSequenceNumber(type: string): Promise<number> {
  const db = await getArchiveDb();
  const doc = await db
    .collection(COLLECTIONS.SEQUENCE_COUNTERS)
    .findOne({ type });
  return doc?.maxSeen || 0;
}

// ─── Stock Baseline Snapshot ───────────────────────────────────────────────────

async function captureStockBaseline(db: Db): Promise<void> {
  try {
    const registry = await sanityClient.fetch(
      groq`*[_type == "stockRegistry"][0]{ stockData, lastUpdated }`,
    );
    if (!registry?.stockData) {
      console.log("⚠️  No stockRegistry found — skipping baseline capture");
      return;
    }

    await db.collection(COLLECTIONS.STOCK_BASELINES).insertOne({
      capturedAt: new Date().toISOString(),
      cutoffDate: getCutoffDate(),
      stockData: registry.stockData,
      lastRegistryUpdate: registry.lastUpdated,
    });

    console.log("📸 Stock baseline captured before archival");
  } catch (err) {
    console.error("❌ Failed to capture stock baseline:", err);
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
      console.error(
        `❌ Failed to delete Sanity asset ${assetId}:`,
        err?.message,
      );
    }
  }
}

// ─── Per-type Archive Functions ────────────────────────────────────────────────

async function archiveDispatchLogs(
  db: Db,
  cutoff: string,
  errors: string[],
): Promise<ArchiveStepResult> {
  const name = "DispatchLogs";
  const docs = await sanityClient.fetch(
    groq`
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
    `,
    { cutoff },
  );

  if (!docs.length) {
    return createArchiveStepResult({
      name,
      count: 0,
      deletedCount: 0,
      message: "No DispatchLogs to archive",
    });
  }

  const numbers = docs.map((d: any) => d.dispatchNumber);
  await updateSequenceCounter(db, "DispatchLog", "DL", numbers);

  const toInsert = docs.map((d: any) => ({
    ...sanitizeForMongo(d),
    _sanityId: d._id,
    _isArchived: true,
    _archivedAt: new Date().toISOString(),
  }));

  const { inserted: inserted_dispatch, skipped: skipped_dispatch } =
    await insertIfNotExists(db, COLLECTIONS.DISPATCH_LOGS, toInsert, errors);

  const deletedCount = 0;
  const stepErrors: string[] = [];

  console.log(`✅ Synced ${docs.length} DispatchLogs`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
    inserted: inserted_dispatch,
    skipped: skipped_dispatch,
  });
}

async function archivePurchaseOrders(
  db: Db,
  cutoff: string,
  errors: string[],
): Promise<ArchiveStepResult> {
  const name = "PurchaseOrders";
  const docs = await sanityClient.fetch(
    groq`
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
    `,
    { cutoff },
  );

  if (!docs.length) {
    return createArchiveStepResult({
      name,
      count: 0,
      deletedCount: 0,
      message: "No PurchaseOrders to archive",
    });
  }

  const numbers = docs.map((d: any) => d.poNumber);
  await updateSequenceCounter(db, "PurchaseOrder", "PO", numbers);

  const toInsert = docs.map((d: any) => ({
    ...sanitizeForMongo(d),
    _sanityId: d._id,
    _isArchived: true,
    _archivedAt: new Date().toISOString(),
  }));

  const { inserted: _inserted_po, skipped: _skipped_po } =
    await insertIfNotExists(db, COLLECTIONS.PURCHASE_ORDERS, toInsert, errors);

  const deletedCount = 0;
  const stepErrors: string[] = [];

  console.log(`✅ Synced ${docs.length} PurchaseOrders`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
    inserted: _inserted_po,
    skipped: _skipped_po,
  });
}

async function archiveGoodsReceipts(
  db: Db,
  cutoff: string,
  errors: string[],
): Promise<ArchiveStepResult> {
  const name = "GoodsReceipts";
  const docs = await sanityClient.fetch(
    groq`
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
    `,
    { cutoff },
  );

  if (!docs.length) {
    return createArchiveStepResult({
      name,
      count: 0,
      deletedCount: 0,
      message: "No GoodsReceipts to archive",
    });
  }

  const numbers = docs.map((d: any) => d.receiptNumber);
  await updateSequenceCounter(db, "GoodsReceipt", "GR", numbers);

  const toInsert = docs.map((d: any) => ({
    ...sanitizeForMongo(d),
    _sanityId: d._id,
    _isArchived: true,
    _archivedAt: new Date().toISOString(),
  }));

  const { inserted: _inserted_gr, skipped: _skipped_gr } =
    await insertIfNotExists(db, COLLECTIONS.GOODS_RECEIPTS, toInsert, errors);

  const deletedCount = 0;
  const stepErrors: string[] = [];

  console.log(`✅ Synced ${docs.length} GoodsReceipts`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
    inserted: _inserted_gr,
    skipped: _skipped_gr,
  });
}

async function archiveInternalTransfers(
  db: Db,
  cutoff: string,
  errors: string[],
): Promise<ArchiveStepResult> {
  const name = "InternalTransfers";
  const docs = await sanityClient.fetch(
    groq`
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
    `,
    { cutoff },
  );

  if (!docs.length) {
    return createArchiveStepResult({
      name,
      count: 0,
      deletedCount: 0,
      message: "No InternalTransfers to archive",
    });
  }

  const numbers = docs.map((d: any) => d.transferNumber);
  await updateSequenceCounter(db, "InternalTransfer", "TRF", numbers);

  const toInsert = docs.map((d: any) => ({
    ...sanitizeForMongo(d),
    _sanityId: d._id,
    _isArchived: true,
    _archivedAt: new Date().toISOString(),
  }));

  const { inserted: _inserted_it, skipped: _skipped_it } =
    await insertIfNotExists(
      db,
      COLLECTIONS.INTERNAL_TRANSFERS,
      toInsert,
      errors,
    );

  const deletedCount = 0;
  const stepErrors: string[] = [];

  console.log(`✅ Synced ${docs.length} InternalTransfers`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
    inserted: _inserted_it,
    skipped: _skipped_it,
  });
}

async function archiveStockAdjustments(
  db: Db,
  cutoff: string,
  errors: string[],
): Promise<ArchiveStepResult> {
  const name = "StockAdjustments";
  const docs = await sanityClient.fetch(
    groq`
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
    `,
    { cutoff },
  );

  if (!docs.length) {
    return createArchiveStepResult({
      name,
      count: 0,
      deletedCount: 0,
      message: "No StockAdjustments to archive",
    });
  }

  const toInsert = docs.map((d: any) => ({
    ...sanitizeForMongo(d),
    _sanityId: d._id,
    _isArchived: true,
    _archivedAt: new Date().toISOString(),
  }));

  const { inserted: _inserted_sa, skipped: _skipped_sa } =
    await insertIfNotExists(
      db,
      COLLECTIONS.STOCK_ADJUSTMENTS,
      toInsert,
      errors,
    );

  const deletedCount = 0;
  const stepErrors: string[] = [];

  console.log(`✅ Synced ${docs.length} StockAdjustments`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
    inserted: _inserted_sa,
    skipped: _skipped_sa,
  });
}

async function archiveInventoryCounts(
  db: Db,
  cutoff: string,
  errors: string[],
): Promise<ArchiveStepResult> {
  const name = "InventoryCounts";
  const docs = await sanityClient.fetch(
    groq`
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
    `,
    { cutoff },
  );

  if (!docs.length) {
    return createArchiveStepResult({
      name,
      count: 0,
      deletedCount: 0,
      message: "No InventoryCounts to archive",
    });
  }

  const toInsert = docs.map((d: any) => ({
    ...sanitizeForMongo(d),
    _sanityId: d._id,
    _isArchived: true,
    _archivedAt: new Date().toISOString(),
  }));

  const { inserted: _inserted_ic, skipped: _skipped_ic } =
    await insertIfNotExists(db, COLLECTIONS.INVENTORY_COUNTS, toInsert, errors);

  const deletedCount = 0;
  const stepErrors: string[] = [];

  console.log(`✅ Synced ${docs.length} InventoryCounts`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
    inserted: _inserted_ic,
    skipped: _skipped_ic,
  });
}

async function archiveFileAttachments(
  db: Db,
  cutoff: string,
  errors: string[],
): Promise<ArchiveStepResult> {
  const name = "FileAttachments";
  const docs = await sanityClient.fetch(
    groq`
        *[_type == "FileAttachment" && uploadedAt < $cutoff] {
            _id, _type, _createdAt, fileName, fileType, uploadedAt, description, isArchived,
            "uploadedBy": uploadedBy->{_id, name, email},
            "relatedTo": relatedTo->{_id, _type},
            "file": file{"asset": asset->{_id, _type, url, originalFilename, mimeType, size}}
        }
    `,
    { cutoff },
  );

  if (!docs.length) {
    return createArchiveStepResult({
      name,
      count: 0,
      deletedCount: 0,
      message: "No FileAttachments to archive",
    });
  }

  const toInsert = docs.map((d: any) => ({
    ...sanitizeForMongo(d),
    _sanityId: d._id,
    _isArchived: true,
    _archivedAt: new Date().toISOString(),
  }));

  const { inserted: _inserted_fa, skipped: _skipped_fa } =
    await insertIfNotExists(db, COLLECTIONS.FILE_ATTACHMENTS, toInsert, errors);

  const deletedCount = 0;
  let assetsDeleted = 0;
  const stepErrors: string[] = [];

  console.log(`✅ Synced ${docs.length} FileAttachments`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
    assetsDeleted,
    inserted: _inserted_fa,
    skipped: _skipped_fa,
  });
}

async function archiveStockSnapshots(
  db: Db,
  cutoff: string,
  errors: string[],
): Promise<ArchiveStepResult> {
  const name = "StockSnapshots";
  const docs = await sanityClient.fetch(
    groq`
        *[_type == "stockSnapshot" && _createdAt < $cutoff] {
            _id, _type, _createdAt, quantity, lastUpdated,
            "stockItem": stockItem->{_id, name, sku},
            "bin": bin->{_id, name, "site": site->{_id, name}}
        }
    `,
    { cutoff },
  );

  if (!docs.length) {
    return createArchiveStepResult({
      name,
      count: 0,
      deletedCount: 0,
      message: "No StockSnapshots to archive",
    });
  }

  const toInsert = docs.map((d: any) => ({
    ...sanitizeForMongo(d),
    _sanityId: d._id,
    _isArchived: true,
    _archivedAt: new Date().toISOString(),
  }));

  const { inserted: _inserted_ss, skipped: _skipped_ss } =
    await insertIfNotExists(db, COLLECTIONS.STOCK_SNAPSHOTS, toInsert, errors);

  const deletedCount = 0;
  const stepErrors: string[] = [];

  console.log(`✅ Synced ${docs.length} StockSnapshots`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
    inserted: _inserted_ss,
    skipped: _skipped_ss,
  });
}

// ─── Index Creation ────────────────────────────────────────────────────────────

async function ensureIndexes(db: Db): Promise<void> {
  try {
    await db
      .collection(COLLECTIONS.DISPATCH_LOGS)
      .createIndex({ dispatchDate: -1 });
    await db
      .collection(COLLECTIONS.DISPATCH_LOGS)
      .createIndex({ dispatchNumber: 1 }, { unique: true, sparse: true });
    await db
      .collection(COLLECTIONS.DISPATCH_LOGS)
      .createIndex({ "sourceSite._id": 1 });
    await db
      .collection(COLLECTIONS.DISPATCH_LOGS)
      .createIndex({ _sanityId: 1 }, { unique: true });

    await db
      .collection(COLLECTIONS.PURCHASE_ORDERS)
      .createIndex({ orderDate: -1 });
    await db
      .collection(COLLECTIONS.PURCHASE_ORDERS)
      .createIndex({ poNumber: 1 }, { unique: true, sparse: true });
    await db
      .collection(COLLECTIONS.PURCHASE_ORDERS)
      .createIndex({ "site._id": 1 });
    await db
      .collection(COLLECTIONS.PURCHASE_ORDERS)
      .createIndex({ _sanityId: 1 }, { unique: true });

    await db
      .collection(COLLECTIONS.GOODS_RECEIPTS)
      .createIndex({ receiptDate: -1 });
    await db
      .collection(COLLECTIONS.GOODS_RECEIPTS)
      .createIndex({ receiptNumber: 1 }, { unique: true, sparse: true });
    await db
      .collection(COLLECTIONS.GOODS_RECEIPTS)
      .createIndex({ _sanityId: 1 }, { unique: true });

    await db
      .collection(COLLECTIONS.INTERNAL_TRANSFERS)
      .createIndex({ transferDate: -1 });
    await db
      .collection(COLLECTIONS.INTERNAL_TRANSFERS)
      .createIndex({ transferNumber: 1 }, { unique: true, sparse: true });
    await db
      .collection(COLLECTIONS.INTERNAL_TRANSFERS)
      .createIndex({ _sanityId: 1 }, { unique: true });

    await db
      .collection(COLLECTIONS.STOCK_ADJUSTMENTS)
      .createIndex({ adjustmentDate: -1 });
    await db
      .collection(COLLECTIONS.STOCK_ADJUSTMENTS)
      .createIndex({ _sanityId: 1 }, { unique: true });

    await db
      .collection(COLLECTIONS.INVENTORY_COUNTS)
      .createIndex({ countDate: -1 });
    await db
      .collection(COLLECTIONS.INVENTORY_COUNTS)
      .createIndex({ _sanityId: 1 }, { unique: true });

    await db
      .collection(COLLECTIONS.FILE_ATTACHMENTS)
      .createIndex({ uploadedAt: -1 });
    await db
      .collection(COLLECTIONS.FILE_ATTACHMENTS)
      .createIndex({ _sanityId: 1 }, { unique: true });

    await db
      .collection(COLLECTIONS.ARCHIVE_RUNS)
      .createIndex({ startedAt: -1 });
    await db
      .collection(COLLECTIONS.SEQUENCE_COUNTERS)
      .createIndex({ type: 1 }, { unique: true });
    await db
      .collection(COLLECTIONS.STOCK_BASELINES)
      .createIndex({ capturedAt: -1 });

    console.log("📋 MongoDB indexes ensured");
  } catch (err) {
    // Indexes already exist — non-fatal
    console.log("ℹ️  Index creation skipped (likely already exist)");
  }
}

export async function cleanupOldArchiveMetadata(): Promise<{
  deletedRuns: number;
  deletedBaselines: number;
  cutoff: string;
}> {
  const db = await getArchiveDb();
  const cutoff = getCutoffDate();

  const deletedRunsResult = await db
    .collection(COLLECTIONS.ARCHIVE_RUNS)
    .deleteMany({ startedAt: { $lt: cutoff } });

  const deletedBaselinesResult = await db
    .collection(COLLECTIONS.STOCK_BASELINES)
    .deleteMany({ capturedAt: { $lt: cutoff } });

  return {
    deletedRuns: deletedRunsResult.deletedCount || 0,
    deletedBaselines: deletedBaselinesResult.deletedCount || 0,
    cutoff,
  };
}

export async function cleanupArchivedSanityData(): Promise<{
  deletedSanityDocuments: number;
  collectionsProcessed: number;
  cutoff: string;
}> {
  const db = await getArchiveDb();
  const cutoff = getCutoffDate();
  const cutoffDate = new Date(cutoff);

  let deletedSanityDocuments = 0;
  const collectionsToProcess = [
    { collectionName: COLLECTIONS.DISPATCH_LOGS, sanityType: "DispatchLog" },
    { collectionName: COLLECTIONS.PURCHASE_ORDERS, sanityType: "PurchaseOrder" },
    { collectionName: COLLECTIONS.GOODS_RECEIPTS, sanityType: "GoodsReceipt" },
    { collectionName: COLLECTIONS.INTERNAL_TRANSFERS, sanityType: "InternalTransfer" },
    { collectionName: COLLECTIONS.STOCK_ADJUSTMENTS, sanityType: "StockAdjustment" },
    { collectionName: COLLECTIONS.INVENTORY_COUNTS, sanityType: "InventoryCount" },
    { collectionName: COLLECTIONS.FILE_ATTACHMENTS, sanityType: "FileAttachment" },
    { collectionName: COLLECTIONS.STOCK_SNAPSHOTS, sanityType: "stockSnapshot" },
  ];

  for (const { collectionName } of collectionsToProcess) {
    const docs = await db
      .collection(collectionName)
      .find({
        _isArchived: true,
        _archivedAt: { $lt: cutoffDate.toISOString() },
      })
      .project({ _sanityId: 1 })
      .toArray();

    for (const doc of docs) {
      if (!doc._sanityId) continue;
      try {
        await writeClient.delete(doc._sanityId);
        deletedSanityDocuments += 1;
      } catch (err: any) {
        if (err?.statusCode !== 404) {
          console.error(
            `Failed to delete Sanity document ${doc._sanityId} from ${collectionName}:`,
            err?.message,
          );
        }
      }
    }
  }

  return {
    deletedSanityDocuments,
    collectionsProcessed: collectionsToProcess.length,
    cutoff,
  };
}

export interface ArchiveCurrentRunStatus {
  runId: string;
  status: "running" | "failed" | "success" | "incomplete";
  startedAt: string;
  currentStep: string | null;
  currentStepIndex: number;
  totalSteps: number;
  completedSteps: string[];
  pendingSteps: string[];
  errors: string[];
  progressPercent: number;
  lastUpdatedAt: string;
}

export async function getArchiveProgress(): Promise<{
  inProgress: boolean;
  currentRun: ArchiveCurrentRunStatus | null;
}> {
  const db = await getArchiveDb();
  const progressId = "archive-progress";
  const progressDoc = await db.collection(COLLECTIONS.ARCHIVE_RUNS).findOne({
    _id: progressId,
    kind: "progress",
  } as any);

  if (!progressDoc) {
    return { inProgress: false, currentRun: null };
  }

  const inProgress = ["running", "incomplete"].includes(progressDoc.status);
  if (!inProgress) {
    return { inProgress: false, currentRun: null };
  }

  const currentRun: ArchiveCurrentRunStatus = {
    runId: progressDoc.owner || progressDoc.runId || progressId,
    status: progressDoc.status || "running",
    startedAt: progressDoc.startedAt || progressDoc.acquiredAt,
    currentStep: progressDoc.currentStep || null,
    currentStepIndex: progressDoc.currentStepIndex || 0,
    totalSteps: progressDoc.totalSteps || 0,
    completedSteps: progressDoc.completedSteps || [],
    pendingSteps: progressDoc.pendingSteps || [],
    errors: progressDoc.errors || [],
    progressPercent: progressDoc.progressPercent || 0,
    lastUpdatedAt: progressDoc.lastUpdatedAt || progressDoc.acquiredAt,
  };

  return { inProgress: true, currentRun };
}

export async function isArchiveInProgress(): Promise<boolean> {
  return (await getArchiveProgress()).inProgress;
}

// ─── Main Archive Runner ───────────────────────────────────────────────────────

export async function runArchive(): Promise<ArchiveRunResult> {
  const startedAt = new Date().toISOString();
  const runId = `archive-${Date.now()}`;
  const errors: string[] = [];

  console.log(`\n🗂️  Starting archive run: ${runId}`);
  console.log(
    `📅 Cutoff date: ${getCutoffDate()} (documents older than ${ARCHIVE_DAYS} days)`,
  );

  const db = await getArchiveDb();
  await ensureIndexes(db);

  const progressId = "archive-progress";
  const progressCollection = db.collection(COLLECTIONS.ARCHIVE_RUNS);

  await progressCollection.updateOne(
    { _id: progressId } as any,
    {
      $set: {
        _id: progressId,
        kind: "progress",
        owner: runId,
        status: "running",
        startedAt,
        runId,
        currentStep: null,
        currentStepIndex: 0,
        totalSteps: 0,
        completedSteps: [],
        pendingSteps: [],
        errors: [],
        progressPercent: 0,
        lastUpdatedAt: new Date().toISOString(),
      },
    } as any,
    { upsert: true },
  );

  // Step 1: Capture stock baseline BEFORE any deletions
    await captureStockBaseline(db);

    const cutoff = getCutoffDate();

    // Step 2: Archive each document type in a resumable loop
    const maxSeconds = parseInt(process.env.ARCHIVE_MAX_SECONDS || "270", 10);
    const allowedMs = maxSeconds * 1000;
    const startMs = Date.now();

    // Determine previously completed successful steps (resume support)
    const lastRun = await db
      .collection(COLLECTIONS.ARCHIVE_RUNS)
      .findOne({}, { sort: { startedAt: -1 } });
    const completedSteps = new Set<string>();
    if (lastRun && Array.isArray(lastRun.steps)) {
      for (const s of lastRun.steps) {
        if (s?.status === "success") completedSteps.add(s.name);
      }
    }

    const stepFns: {
      key: string;
      name: string;
      fn: (
        db: Db,
        cutoff: string,
        errors: string[],
      ) => Promise<ArchiveStepResult>;
    }[] = [
      { key: "dispatchLogs", name: "DispatchLogs", fn: archiveDispatchLogs },
      {
        key: "purchaseOrders",
        name: "PurchaseOrders",
        fn: archivePurchaseOrders,
      },
      { key: "goodsReceipts", name: "GoodsReceipts", fn: archiveGoodsReceipts },
      {
        key: "internalTransfers",
        name: "InternalTransfers",
        fn: archiveInternalTransfers,
      },
      {
        key: "stockAdjustments",
        name: "StockAdjustments",
        fn: archiveStockAdjustments,
      },
      {
        key: "inventoryCounts",
        name: "InventoryCounts",
        fn: archiveInventoryCounts,
      },
      {
        key: "fileAttachments",
        name: "FileAttachments",
        fn: archiveFileAttachments,
      },
      {
        key: "stockSnapshots",
        name: "StockSnapshots",
        fn: archiveStockSnapshots,
      },
    ];

    await progressCollection.updateOne(
      { _id: progressId } as any,
      {
        $set: {
          totalSteps: stepFns.length,
          completedSteps: [],
          pendingSteps: stepFns.map((step) => step.name),
          lastUpdatedAt: new Date().toISOString(),
        },
      } as any,
    );

    const steps: ArchiveStepResult[] = [];
    const archived: Record<string, number> = {};
    let totalInserted = 0;
    let totalSkipped = 0;

    for (const s of stepFns) {
      // Skip steps already completed in the last successful run
      if (completedSteps.has(s.name)) {
        const skippedStep = createArchiveStepResult({
          name: s.name,
          count: 0,
          deletedCount: 0,
          message: "Already archived in previous successful run",
        });
        skippedStep.status = "success";
        steps.push(skippedStep);
        archived[s.key] = 0;
        continue;
      }

      // Check elapsed time before starting this step
      const elapsed = Date.now() - startMs;
      if (elapsed >= allowedMs - 2000) {
        // Time nearly exhausted — persist partial run and return
        const partialResult: ArchiveRunResult = {
          runId,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startMs,
          archived,
          errors,
          skipped: 0,
          steps,
          assetsDeleted: steps.reduce(
            (sum, st) => sum + (st.assetsDeleted || 0),
            0,
          ),
          incomplete: true,
        };
        await db.collection(COLLECTIONS.ARCHIVE_RUNS).insertOne(partialResult);
        await progressCollection.updateOne(
          { _id: progressId } as any,
          {
            $set: {
              status: "incomplete",
              currentStep: s.name,
              currentStepIndex: steps.length,
              completedSteps: steps.map((step) => step.name),
              pendingSteps: stepFns
                .map((step) => step.name)
                .filter(
                  (name) => !steps.map((step) => step.name).includes(name),
                ),
              errors,
              progressPercent: Math.min(
                100,
                Math.round((steps.length / stepFns.length) * 100),
              ),
              lastUpdatedAt: new Date().toISOString(),
            },
          } as any,
        );
        console.log(
          "⚠️ Archive run paused due to time limit; will resume on next trigger",
        );
        return partialResult;
      }

      try {
        const stepRes = await s.fn(db, cutoff, errors).catch((e) => {
          errors.push(`${s.name} batch failed: ${e?.message}`);
          return createArchiveStepResult({
            name: s.name,
            count: 0,
            deletedCount: 0,
            errors: [e?.message || "unknown"],
            message: "Step failed",
          });
        });
        steps.push(stepRes);
        // Aggregate inserted/skipped totals when present
        totalInserted += stepRes.inserted || 0;
        totalSkipped += stepRes.skipped || 0;
        archived[s.key] = stepRes.count || 0;

        const completedStepNames = steps
          .filter((runStep) => runStep.status === "success")
          .map((runStep) => runStep.name);
        const pendingStepNames = stepFns
          .map((step) => step.name)
          .filter((name) => !completedStepNames.includes(name));
        const progressPercent = Math.min(
          100,
          Math.round((steps.length / stepFns.length) * 100),
        );

        await progressCollection.updateOne(
          { _id: progressId } as any,
          {
            $set: {
              currentStep: s.name,
              currentStepIndex: steps.length,
              stepStatus: stepRes.status,
              completedSteps: completedStepNames,
              pendingSteps: pendingStepNames,
              errors,
              progressPercent,
              lastUpdatedAt: new Date().toISOString(),
            },
          } as any,
        );
      } catch (e: any) {
        const stepErr = createArchiveStepResult({
          name: s.name,
          count: 0,
          deletedCount: 0,
          errors: [e?.message || String(e)],
        });
        steps.push(stepErr);
        archived[s.key] = 0;
        errors.push(`${s.name} batch failed: ${e?.message}`);
      }
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    const result: ArchiveRunResult = {
      runId,
      startedAt,
      completedAt,
      durationMs,
      archived,
      errors,
      skipped: totalSkipped,
      totalInserted,
      totalSkipped,
      steps,
      assetsDeleted: steps.reduce(
        (sum, step) => sum + (step.assetsDeleted || 0),
        0,
      ),
      incomplete: false,
    };

    // Step 3: Log the run
    await db.collection(COLLECTIONS.ARCHIVE_RUNS).insertOne(result);
    await progressCollection.updateOne(
      { _id: progressId } as any,
      {
        $set: {
          status: result.incomplete
            ? "incomplete"
            : result.errors.length
              ? "failed"
              : "success",
          completedAt: result.completedAt,
          currentStep: null,
          currentStepIndex: stepFns.length,
          completedSteps: stepFns.map((step) => step.name),
          pendingSteps: [],
          errors,
          progressPercent: 100,
          lastUpdatedAt: new Date().toISOString(),
        },
      } as any,
    );

    const totalArchived = Object.values(result.archived).reduce(
      (a, b) => a + b,
      0,
    );
    console.log(
      `\n🎉 Archive run complete: ${totalArchived} documents archived in ${durationMs}ms`,
    );
    if (errors.length)
      console.error(`⚠️  ${errors.length} errors occurred:`, errors);

    return result;
}

/**
 * Resume any incomplete archive runs by triggering `runArchive()` until all incomplete
 * runs are finished or `maxAttempts` is reached. This is intended to be called from a
 * scheduled cron job or admin trigger.
 */
export async function resumeIncompleteArchives(
  maxAttempts: number = 5,
): Promise<{ attempts: number; finished: boolean }> {
  const db = await getArchiveDb();
  let attempts = 0;

  for (; attempts < maxAttempts; attempts++) {
    const incompleteRun = await db
      .collection(COLLECTIONS.ARCHIVE_RUNS)
      .findOne({ incomplete: true }, { sort: { startedAt: -1 } });

    if (!incompleteRun) return { attempts, finished: true };

    console.log(
      `🔁 Resuming incomplete archive run (found: ${incompleteRun.runId})`,
    );

    // Trigger a normal runArchive() which will resume from previously completed steps
    const res = await runArchive();

    // If this run finished (res.incomplete !== true), clear any older incomplete flags
    if (!res.incomplete) {
      await db
        .collection(COLLECTIONS.ARCHIVE_RUNS)
        .updateMany(
          { incomplete: true, runId: { $ne: res.runId } },
          { $set: { incomplete: false } },
        );
    }

    // If no more incomplete runs remain, we are done
    const remaining = await db
      .collection(COLLECTIONS.ARCHIVE_RUNS)
      .findOne({ incomplete: true });
    if (!remaining) return { attempts: attempts + 1, finished: true };
  }

  return { attempts, finished: false };
}
