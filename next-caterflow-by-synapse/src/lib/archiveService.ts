import { client as sanityClient, writeClient } from "@/lib/sanity";
import { groq } from "next-sanity";
import { getArchiveDb, COLLECTIONS } from "@/lib/mongoClient";
import type { Db } from "mongodb";

const ARCHIVE_DAYS = parseInt(process.env.ARCHIVE_DAYS_THRESHOLD || "90", 10);

export interface ArchiveStepResult {
  name: string;
  count: number;
  deletedCount: number;
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
  steps: ArchiveStepResult[];
  assetsDeleted: number;
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
}): ArchiveStepResult {
  return {
    name: options.name,
    count: options.count,
    deletedCount: options.deletedCount,
    status: options.errors && options.errors.length ? "partial" : "success",
    errors: options.errors || [],
    warnings: options.warnings || [],
    assetsDeleted: options.assetsDeleted || 0,
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
  return cleaned;
}

/**
 * Insert documents into archive collection but skip those already archived (by _sanityId)
 * Returns number inserted and number skipped
 */
async function insertIfNotExists(
  db: Db,
  collectionName: string,
  docs: any[],
  errors: string[],
): Promise<{ inserted: number; skipped: number }> {
  if (!docs.length) return { inserted: 0, skipped: 0 };

  const collection = db.collection(collectionName);
  const sanityIds = docs.map((d) => d._sanityId).filter(Boolean);
  const existing = await collection
    .find({ _sanityId: { $in: sanityIds } })
    .project({ _sanityId: 1 })
    .toArray();
  const existingSet = new Set(existing.map((e: any) => e._sanityId));

  const toInsert = docs.filter((d) => !existingSet.has(d._sanityId));
  const skipped = docs.length - toInsert.length;

  if (!toInsert.length) {
    if (skipped > 0) {
      errors.push(
        `Skipped ${skipped} already-archived documents for ${collectionName}`,
      );
    }
    return { inserted: 0, skipped };
  }

  try {
    const res = await collection.insertMany(toInsert, { ordered: false });
    const inserted = (res?.insertedCount as number) || toInsert.length;
    if (skipped > 0) {
      errors.push(
        `Skipped ${skipped} already-archived documents for ${collectionName}`,
      );
    }
    return { inserted, skipped };
  } catch (e: any) {
    // Capture duplicate key / partial insert situations
    const msg = e?.message || String(e);
    errors.push(`${collectionName} insert error: ${msg}`);
    // Try to approximate how many were inserted
    const inserted = (e?.result?.nInserted as number) || 0;
    const totalSkipped = skipped + (docs.length - inserted - skipped);
    return { inserted, skipped: totalSkipped };
  }
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

  const { inserted: _inserted_dispatch, skipped: _skipped_dispatch } =
    await insertIfNotExists(db, COLLECTIONS.DISPATCH_LOGS, toInsert, errors);

  const ids = docs.map((d: any) => d._id);
  let deletedCount = 0;
  const stepErrors: string[] = [];
  for (const id of ids) {
    try {
      await writeClient.delete(id);
      deletedCount += 1;
    } catch (e: any) {
      const message = `Failed to delete DispatchLog ${id}: ${e?.message}`;
      errors.push(message);
      stepErrors.push(message);
    }
  }

  console.log(`✅ Archived ${docs.length} DispatchLogs`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
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

  const ids = docs.map((d: any) => d._id);
  let deletedCount = 0;
  const stepErrors: string[] = [];
  for (const id of ids) {
    try {
      await writeClient.delete(id);
      deletedCount += 1;
    } catch (e: any) {
      const message = `Failed to delete PurchaseOrder ${id}: ${e?.message}`;
      errors.push(message);
      stepErrors.push(message);
    }
  }

  console.log(`✅ Archived ${docs.length} PurchaseOrders`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
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

  const ids = docs.map((d: any) => d._id);
  let deletedCount = 0;
  const stepErrors: string[] = [];
  for (const id of ids) {
    try {
      await writeClient.delete(id);
      deletedCount += 1;
    } catch (e: any) {
      const message = `Failed to delete GoodsReceipt ${id}: ${e?.message}`;
      errors.push(message);
      stepErrors.push(message);
    }
  }

  console.log(`✅ Archived ${docs.length} GoodsReceipts`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
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

  const ids = docs.map((d: any) => d._id);
  let deletedCount = 0;
  const stepErrors: string[] = [];
  for (const id of ids) {
    try {
      await writeClient.delete(id);
      deletedCount += 1;
    } catch (e: any) {
      const message = `Failed to delete InternalTransfer ${id}: ${e?.message}`;
      errors.push(message);
      stepErrors.push(message);
    }
  }

  console.log(`✅ Archived ${docs.length} InternalTransfers`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
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

  const ids = docs.map((d: any) => d._id);
  let deletedCount = 0;
  const stepErrors: string[] = [];
  for (const id of ids) {
    try {
      await writeClient.delete(id);
      deletedCount += 1;
    } catch (e: any) {
      const message = `Failed to delete StockAdjustment ${id}: ${e?.message}`;
      errors.push(message);
      stepErrors.push(message);
    }
  }

  console.log(`✅ Archived ${docs.length} StockAdjustments`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
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

  const ids = docs.map((d: any) => d._id);
  let deletedCount = 0;
  const stepErrors: string[] = [];
  for (const id of ids) {
    try {
      await writeClient.delete(id);
      deletedCount += 1;
    } catch (e: any) {
      const message = `Failed to delete InventoryCount ${id}: ${e?.message}`;
      errors.push(message);
      stepErrors.push(message);
    }
  }

  console.log(`✅ Archived ${docs.length} InventoryCounts`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
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

  let deletedCount = 0;
  let assetsDeleted = 0;
  const stepErrors: string[] = [];

  for (const doc of docs) {
    const assetId = doc.file?.asset?._id;
    if (assetId) {
      try {
        await deleteSanityAsset(assetId);
        assetsDeleted += 1;
      } catch (e: any) {
        const message = `Failed to delete asset ${assetId} for FileAttachment ${doc._id}: ${e?.message}`;
        errors.push(message);
        stepErrors.push(message);
      }
    }

    try {
      await writeClient.delete(doc._id);
      deletedCount += 1;
    } catch (e: any) {
      const message = `Failed to delete FileAttachment ${doc._id}: ${e?.message}`;
      errors.push(message);
      stepErrors.push(message);
    }
  }

  console.log(`✅ Archived ${docs.length} FileAttachments`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
    assetsDeleted,
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

  const ids = docs.map((d: any) => d._id);
  let deletedCount = 0;
  const stepErrors: string[] = [];
  for (const id of ids) {
    try {
      await writeClient.delete(id);
      deletedCount += 1;
    } catch (e: any) {
      const message = `Failed to delete stockSnapshot ${id}: ${e?.message}`;
      errors.push(message);
      stepErrors.push(message);
    }
  }

  console.log(`✅ Archived ${docs.length} StockSnapshots`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
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

  // Step 1: Capture stock baseline BEFORE any deletions
  await captureStockBaseline(db);

  const cutoff = getCutoffDate();

  // Step 2: Archive each document type (collect step objects)
  const dispatchLogsStep = await archiveDispatchLogs(db, cutoff, errors).catch(
    (e) => {
      errors.push(`DispatchLog batch failed: ${e?.message}`);
      return {
        name: "DispatchLogs",
        count: 0,
        deletedCount: 0,
        status: "failed",
        errors: [e?.message || "unknown"],
        warnings: [],
      } as ArchiveStepResult;
    },
  );
  const purchaseOrdersStep = await archivePurchaseOrders(
    db,
    cutoff,
    errors,
  ).catch((e) => {
    errors.push(`PurchaseOrder batch failed: ${e?.message}`);
    return {
      name: "PurchaseOrders",
      count: 0,
      deletedCount: 0,
      status: "failed",
      errors: [e?.message || "unknown"],
      warnings: [],
    } as ArchiveStepResult;
  });
  const goodsReceiptsStep = await archiveGoodsReceipts(
    db,
    cutoff,
    errors,
  ).catch((e) => {
    errors.push(`GoodsReceipt batch failed: ${e?.message}`);
    return {
      name: "GoodsReceipts",
      count: 0,
      deletedCount: 0,
      status: "failed",
      errors: [e?.message || "unknown"],
      warnings: [],
    } as ArchiveStepResult;
  });
  const internalTransfersStep = await archiveInternalTransfers(
    db,
    cutoff,
    errors,
  ).catch((e) => {
    errors.push(`InternalTransfer batch failed: ${e?.message}`);
    return {
      name: "InternalTransfers",
      count: 0,
      deletedCount: 0,
      status: "failed",
      errors: [e?.message || "unknown"],
      warnings: [],
    } as ArchiveStepResult;
  });
  const stockAdjustmentsStep = await archiveStockAdjustments(
    db,
    cutoff,
    errors,
  ).catch((e) => {
    errors.push(`StockAdjustment batch failed: ${e?.message}`);
    return {
      name: "StockAdjustments",
      count: 0,
      deletedCount: 0,
      status: "failed",
      errors: [e?.message || "unknown"],
      warnings: [],
    } as ArchiveStepResult;
  });
  const inventoryCountsStep = await archiveInventoryCounts(
    db,
    cutoff,
    errors,
  ).catch((e) => {
    errors.push(`InventoryCount batch failed: ${e?.message}`);
    return {
      name: "InventoryCounts",
      count: 0,
      deletedCount: 0,
      status: "failed",
      errors: [e?.message || "unknown"],
      warnings: [],
    } as ArchiveStepResult;
  });
  const fileAttachmentsStep = await archiveFileAttachments(
    db,
    cutoff,
    errors,
  ).catch((e) => {
    errors.push(`FileAttachment batch failed: ${e?.message}`);
    return {
      name: "FileAttachments",
      count: 0,
      deletedCount: 0,
      status: "failed",
      errors: [e?.message || "unknown"],
      warnings: [],
    } as ArchiveStepResult;
  });
  const stockSnapshotsStep = await archiveStockSnapshots(
    db,
    cutoff,
    errors,
  ).catch((e) => {
    errors.push(`StockSnapshot batch failed: ${e?.message}`);
    return {
      name: "StockSnapshots",
      count: 0,
      deletedCount: 0,
      status: "failed",
      errors: [e?.message || "unknown"],
      warnings: [],
    } as ArchiveStepResult;
  });

  const completedAt = new Date().toISOString();
  const durationMs =
    new Date(completedAt).getTime() - new Date(startedAt).getTime();

  const steps: ArchiveStepResult[] = [
    dispatchLogsStep,
    purchaseOrdersStep,
    goodsReceiptsStep,
    internalTransfersStep,
    stockAdjustmentsStep,
    inventoryCountsStep,
    fileAttachmentsStep,
    stockSnapshotsStep,
  ];

  const result: ArchiveRunResult = {
    runId,
    startedAt,
    completedAt,
    durationMs,
    archived: {
      dispatchLogs: dispatchLogsStep.count,
      purchaseOrders: purchaseOrdersStep.count,
      goodsReceipts: goodsReceiptsStep.count,
      internalTransfers: internalTransfersStep.count,
      stockAdjustments: stockAdjustmentsStep.count,
      inventoryCounts: inventoryCountsStep.count,
      fileAttachments: fileAttachmentsStep.count,
      stockSnapshots: stockSnapshotsStep.count,
    },
    errors,
    skipped: 0,
    steps,
    assetsDeleted: steps.reduce(
      (sum, step) => sum + (step.assetsDeleted || 0),
      0,
    ),
  };

  // Step 3: Log the run
  await db.collection(COLLECTIONS.ARCHIVE_RUNS).insertOne(result);

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
