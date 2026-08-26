import { client as sanityClient, writeClient } from "@/lib/sanity";
import { groq } from "next-sanity";
import { getArchiveDb, COLLECTIONS } from "@/lib/mongoClient";
import type { Db } from "mongodb";

const ARCHIVE_DAYS = parseInt(process.env.ARCHIVE_DAYS_THRESHOLD || "90", 10);
let appendProgress:
  | ((message: string | { skippedItem?: any }) => void)
  | undefined;

export interface ArchiveStepResult {
  name: string;
  count: number;
  deletedCount: number;
  // `inserted` = brand-new documents written to Mongo for the first time.
  // `updated` = documents that already existed in Mongo and were changed.
  // These were previously conflated under `inserted` (i.e. it meant
  // "inserted or updated"), which mislabeled the admin UI's "Inserted"
  // column. Kept both as separate optional counts so old readers of
  // `inserted` still get a number, just now an accurate one.
  inserted?: number;
  updated?: number;
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
  warnings: string[];
  skipped: number;
  totalInserted?: number;
  totalUpdated?: number;
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
  updated?: number;
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
    updated: options.updated || 0,
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

export function normalizeForComparison(value: any): any {
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

export function stableSerialize(value: any): string {
  return JSON.stringify(normalizeForComparison(value));
}

function buildArchivedDocumentPayload(doc: any): any {
  return {
    ...sanitizeForMongo(doc),
    _sanityId: doc._sanityId || doc._id,
    _isArchived: true,
  };
}

function getArchivePayloadLabel(payload: any): string {
  if (!payload || typeof payload !== "object") return "document";
  const fallbackId = payload._sanityId || payload._id || "document";
  return (
    payload.file?.asset?.originalFilename ||
    payload.fileName ||
    payload.poNumber ||
    payload.dispatchNumber ||
    payload.receiptNumber ||
    payload.transferNumber ||
    payload.adjustmentNumber ||
    payload.countNumber ||
    payload.title ||
    payload.name ||
    fallbackId
  );
}

function buildArchiveProgressMessage(
  payload: any,
  action: "inserted" | "updated" | "skipped",
): string {
  const type = payload._type || payload.type || "document";
  const label = getArchivePayloadLabel(payload);
  return `${action.charAt(0).toUpperCase() + action.slice(1)} ${type} ${label}`;
}

function isDuplicateKeyError(err: any): boolean {
  return (
    err?.code === 11000 ||
    (typeof err?.message === "string" &&
      err.message.toLowerCase().includes("duplicate key error"))
  );
}

function getAlternateUniqueQuery(payload: any): Record<string, any> | null {
  const uniqueKeys = [
    "dispatchNumber",
    "poNumber",
    "receiptNumber",
    "transferNumber",
    "adjustmentNumber",
    "countNumber",
  ];
  for (const key of uniqueKeys) {
    if (payload[key]) {
      return { [key]: payload[key] };
    }
  }
  return null;
}

async function resolveDuplicateKeyConflict(
  collection: any,
  payload: any,
  progress?: (message: string | { skippedItem?: any }) => void,
): Promise<boolean> {
  if (!payload._sanityId) {
    try {
      progress?.({
        skippedItem: {
          collection: collection.collectionName || null,
          reason: "no_sanity_id",
          label: getArchivePayloadLabel(payload),
          message: buildArchiveProgressMessage(payload, "skipped"),
        },
      });
    } catch (e) {
      /* ignore */
    }
    return true;
  }

  const altQuery = getAlternateUniqueQuery(payload);
  if (!altQuery) return false;

  const existingByAlt = await collection.findOne(altQuery);
  if (!existingByAlt) return false;

  await collection.replaceOne(
    { _id: existingByAlt._id },
    {
      ...payload,
      _archivedAt: new Date().toISOString(),
      _lastSyncedAt: new Date().toISOString(),
    },
    { upsert: true },
  );
  progress?.(buildArchiveProgressMessage(payload, "updated"));
  return true;
}

/**
 * Sync Sanity documents into Mongo using _sanityId as the identity key.
 * New documents are inserted, existing documents with changed content are updated,
 * and unchanged documents are skipped.
 */
export async function insertIfNotExists(
  db: Db,
  collectionName: string,
  docs: any[],
  errors: string[],
  progress?: (message: string | { skippedItem?: any }) => void,
): Promise<{ inserted: number; updated: number; skipped: number }> {
  if (!docs.length) return { inserted: 0, updated: 0, skipped: 0 };

  const collection = db.collection(collectionName);
  const payloads = docs
    .map(buildArchivedDocumentPayload)
    .filter((p) => p._sanityId);
  const skippedNoId = docs.length - payloads.length;
  if (skippedNoId > 0) {
    console.warn(
      `⚠️  Skipping ${skippedNoId} documents without valid Sanity IDs in ${collectionName}`,
    );
    try {
      progress?.({
        skippedItem: {
          collection: collectionName,
          reason: "no_sanity_id",
          count: skippedNoId,
          message: `Skipped ${skippedNoId} documents without valid Sanity IDs in ${collectionName}`,
        },
      });
    } catch (e) {
      /* ignore progress callback errors */
    }
  }

  if (!payloads.length) return { inserted: 0, updated: 0, skipped: skippedNoId };

  const sanityIds = payloads
    .map((payload) => payload._sanityId)
    .filter(Boolean);

  const existingDocs = await collection
    .find({ _sanityId: { $in: sanityIds } })
    .toArray();
  const existingById = new Map(
    existingDocs.map((doc: any) => [doc._sanityId, doc]),
  );

  const operations: any[] = [];
  const progressMessages: string[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const payload of payloads) {
    const existing = existingById.get(payload._sanityId);
    const archivedAt = new Date().toISOString();
    const isUpdate = Boolean(existing);

    if (!existing) {
      operations.push({
        insertOne: {
          document: {
            ...payload,
            _archivedAt: archivedAt,
          },
        },
      });
      progressMessages.push(buildArchiveProgressMessage(payload, "inserted"));
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
      // Record structured skipped item (unchanged)
      try {
        progress?.({
          skippedItem: {
            collection: collectionName,
            _sanityId: payload._sanityId,
            label: getArchivePayloadLabel(payload),
            reason: "unchanged",
            message: buildArchiveProgressMessage(payload, "skipped"),
          },
        });
      } catch (e) {
        /* ignore */
      }
      skipped += 1;
      continue;
    }

    operations.push({
      replaceOne: {
        filter: { _sanityId: payload._sanityId },
        replacement: {
          ...payload,
          _archivedAt: archivedAt,
          _lastSyncedAt: new Date().toISOString(),
        },
        upsert: true,
      },
    });
    progressMessages.push(buildArchiveProgressMessage(payload, "updated"));
    updated += 1;
  }

  if (operations.length) {
    try {
      await withRetry(() =>
        collection.bulkWrite(operations, { ordered: false }),
      );
      progressMessages.forEach((message) => progress?.(message));
    } catch (err: any) {
      // Log full detail before falling back — a BulkWriteError carries a
      // per-operation `.writeErrors` array (each with its own index/errmsg)
      // that was previously discarded entirely in favor of one generic
      // message, making it impossible to tell which document(s) actually
      // caused the failure.
      console.error(
        `❌ Bulk write failed for ${collectionName} (${operations.length} ops):`,
        err?.message || err,
      );
      if (Array.isArray(err?.writeErrors) && err.writeErrors.length) {
        console.error(
          `   ${err.writeErrors.length} individual write error(s):`,
          err.writeErrors.map((we: any) => ({
            index: we.index,
            code: we.code,
            errmsg: we.errmsg,
          })),
        );
      }
      errors.push(
        `Bulk write failed for ${collectionName}: ${err?.message || err} — falling back to per-document writes`,
      );

      // Fallback to single-document writes for robustness.
      inserted = 0;
      updated = 0;
      skipped = 0;
      let failedDocs = 0;

      for (const doc of docs) {
        // Each document gets its OWN try/catch: a genuine (non-duplicate-key)
        // failure on one document must NOT abort the remaining documents in
        // this batch. Previously a single `throw err` here propagated out of
        // the whole `for` loop, so every document after the failing one was
        // silently never attempted — with only the one failing document's
        // error ever surfacing, and no indication anything else was skipped.
        try {
          const payload = buildArchivedDocumentPayload(doc);
          const existing = await collection.findOne({
            _sanityId: payload._sanityId,
          });

          if (!existing) {
            try {
              await collection.insertOne({
                ...payload,
                _archivedAt: new Date().toISOString(),
              });
              inserted += 1;
              progress?.(buildArchiveProgressMessage(payload, "inserted"));
              continue;
            } catch (insertErr: any) {
              if (
                isDuplicateKeyError(insertErr) &&
                (await resolveDuplicateKeyConflict(
                  collection,
                  payload,
                  progress,
                ))
              ) {
                updated += 1;
                continue;
              }
              throw insertErr;
            }
          }

          const existingComparable = { ...existing };
          const payloadComparable = { ...payload };
          delete (existingComparable as any)._id;
          delete (existingComparable as any)._archivedAt;
          delete (existingComparable as any)._lastSyncedAt;
          delete (payloadComparable as any)._archivedAt;
          delete (payloadComparable as any)._lastSyncedAt;

          if (
            stableSerialize(existingComparable) ===
            stableSerialize(payloadComparable)
          ) {
            // record structured skipped item (unchanged)
            try {
              progress?.({
                skippedItem: {
                  collection: collectionName,
                  _sanityId: payload._sanityId,
                  label: getArchivePayloadLabel(payload),
                  reason: "unchanged",
                  message: buildArchiveProgressMessage(payload, "skipped"),
                },
              });
            } catch (progressErr) {
              console.warn(
                "Progress callback threw while reporting a skipped item (non-fatal):",
                progressErr,
              );
            }
            skipped += 1;
            continue;
          }

          try {
            await collection.replaceOne(
              { _sanityId: payload._sanityId },
              {
                ...payload,
                _archivedAt: new Date().toISOString(),
                _lastSyncedAt: new Date().toISOString(),
              },
              { upsert: true },
            );
            updated += 1;
            progress?.(buildArchiveProgressMessage(payload, "updated"));
          } catch (replaceErr: any) {
            if (
              isDuplicateKeyError(replaceErr) &&
              (await resolveDuplicateKeyConflict(
                collection,
                payload,
                progress,
              ))
            ) {
              updated += 1;
              continue;
            }
            throw replaceErr;
          }
        } catch (docErr: any) {
          // This document genuinely failed and was NOT recovered above.
          // Log it in full and record it, then move on to the next
          // document — do not let one bad document silently swallow the
          // rest of the batch.
          failedDocs += 1;
          const identifier =
            doc?._id || doc?._sanityId || getArchivePayloadLabel(doc) || "unknown";
          console.error(
            `❌ Failed to archive document ${identifier} in ${collectionName}:`,
            docErr,
          );
          errors.push(
            `Failed to archive ${collectionName} document ${identifier}: ${docErr?.message || docErr}`,
          );
        }
      }

      if (failedDocs > 0) {
        console.error(
          `❌ ${failedDocs}/${docs.length} document(s) in ${collectionName} failed to archive even after per-document fallback — see errors above and in the run's errors list.`,
        );
      }
    }
  } else {
    progressMessages.forEach((message) => progress?.(message));
  }

  return { inserted, updated, skipped };
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

  const {
    inserted: inserted_dispatch,
    updated: updated_dispatch,
    skipped: skipped_dispatch,
  } = await insertIfNotExists(
    db,
    COLLECTIONS.DISPATCH_LOGS,
    toInsert,
    errors,
    appendProgress,
  );

  const deletedCount = 0;
  const stepErrors: string[] = [];

  console.log(`✅ Synced ${docs.length} DispatchLogs`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
    inserted: inserted_dispatch,
    updated: updated_dispatch,
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

  const {
    inserted: _inserted_po,
    updated: _updated_po,
    skipped: _skipped_po,
  } = await insertIfNotExists(
    db,
    COLLECTIONS.PURCHASE_ORDERS,
    toInsert,
    errors,
    appendProgress,
  );

  const deletedCount = 0;
  const stepErrors: string[] = [];

  console.log(`✅ Synced ${docs.length} PurchaseOrders`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
    inserted: _inserted_po,
    updated: _updated_po,
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

  const {
    inserted: _inserted_gr,
    updated: _updated_gr,
    skipped: _skipped_gr,
  } = await insertIfNotExists(
    db,
    COLLECTIONS.GOODS_RECEIPTS,
    toInsert,
    errors,
    appendProgress,
  );

  const deletedCount = 0;
  const stepErrors: string[] = [];

  console.log(`✅ Synced ${docs.length} GoodsReceipts`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
    inserted: _inserted_gr,
    updated: _updated_gr,
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

  const {
    inserted: _inserted_it,
    updated: _updated_it,
    skipped: _skipped_it,
  } = await insertIfNotExists(
    db,
    COLLECTIONS.INTERNAL_TRANSFERS,
    toInsert,
    errors,
    appendProgress,
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
    updated: _updated_it,
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

  const {
    inserted: _inserted_sa,
    updated: _updated_sa,
    skipped: _skipped_sa,
  } = await insertIfNotExists(
    db,
    COLLECTIONS.STOCK_ADJUSTMENTS,
    toInsert,
    errors,
    appendProgress,
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
    updated: _updated_sa,
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

  const {
    inserted: _inserted_ic,
    updated: _updated_ic,
    skipped: _skipped_ic,
  } = await insertIfNotExists(
    db,
    COLLECTIONS.INVENTORY_COUNTS,
    toInsert,
    errors,
    appendProgress,
  );

  const deletedCount = 0;
  const stepErrors: string[] = [];

  console.log(`✅ Synced ${docs.length} InventoryCounts`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
    inserted: _inserted_ic,
    updated: _updated_ic,
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

  const {
    inserted: _inserted_fa,
    updated: _updated_fa,
    skipped: _skipped_fa,
  } = await insertIfNotExists(
    db,
    COLLECTIONS.FILE_ATTACHMENTS,
    toInsert,
    errors,
    appendProgress,
  );

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
    updated: _updated_fa,
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

  const {
    inserted: _inserted_ss,
    updated: _updated_ss,
    skipped: _skipped_ss,
  } = await insertIfNotExists(
    db,
    COLLECTIONS.STOCK_SNAPSHOTS,
    toInsert,
    errors,
    appendProgress,
  );

  const deletedCount = 0;
  const stepErrors: string[] = [];

  console.log(`✅ Synced ${docs.length} StockSnapshots`);
  return createArchiveStepResult({
    name,
    count: docs.length,
    deletedCount,
    errors: stepErrors,
    inserted: _inserted_ss,
    updated: _updated_ss,
    skipped: _skipped_ss,
  });
}

// ─── Index Creation ────────────────────────────────────────────────────────────

// Each index is its own [collection, spec, options] tuple, created
// independently. Previously all ~20 createIndex calls ran in one try block
// where the FIRST failure silently aborted every index after it, and the
// single catch discarded the real error entirely, logging only "likely
// already exist" — which is frequently false (auth issues, conflicting
// index options, bad field paths, timeouts all land here too) and gave no
// way to tell which index, or how many, actually failed.
async function ensureIndexes(
  db: Db,
): Promise<{ created: number; failed: { spec: string; error: string }[] }> {
  const indexSpecs: {
    collection: string;
    spec: Record<string, 1 | -1>;
    options?: Record<string, any>;
  }[] = [
    { collection: COLLECTIONS.DISPATCH_LOGS, spec: { dispatchDate: -1 } },
    {
      collection: COLLECTIONS.DISPATCH_LOGS,
      spec: { dispatchNumber: 1 },
      options: { unique: true, sparse: true },
    },
    { collection: COLLECTIONS.DISPATCH_LOGS, spec: { "sourceSite._id": 1 } },
    {
      collection: COLLECTIONS.DISPATCH_LOGS,
      spec: { _sanityId: 1 },
      options: { unique: true },
    },

    { collection: COLLECTIONS.PURCHASE_ORDERS, spec: { orderDate: -1 } },
    {
      collection: COLLECTIONS.PURCHASE_ORDERS,
      spec: { poNumber: 1 },
      options: { unique: true, sparse: true },
    },
    { collection: COLLECTIONS.PURCHASE_ORDERS, spec: { "site._id": 1 } },
    {
      collection: COLLECTIONS.PURCHASE_ORDERS,
      spec: { _sanityId: 1 },
      options: { unique: true },
    },

    { collection: COLLECTIONS.GOODS_RECEIPTS, spec: { receiptDate: -1 } },
    {
      collection: COLLECTIONS.GOODS_RECEIPTS,
      spec: { receiptNumber: 1 },
      options: { unique: true, sparse: true },
    },
    {
      collection: COLLECTIONS.GOODS_RECEIPTS,
      spec: { _sanityId: 1 },
      options: { unique: true },
    },

    { collection: COLLECTIONS.INTERNAL_TRANSFERS, spec: { transferDate: -1 } },
    {
      collection: COLLECTIONS.INTERNAL_TRANSFERS,
      spec: { transferNumber: 1 },
      options: { unique: true, sparse: true },
    },
    {
      collection: COLLECTIONS.INTERNAL_TRANSFERS,
      spec: { _sanityId: 1 },
      options: { unique: true },
    },

    { collection: COLLECTIONS.STOCK_ADJUSTMENTS, spec: { adjustmentDate: -1 } },
    {
      collection: COLLECTIONS.STOCK_ADJUSTMENTS,
      spec: { _sanityId: 1 },
      options: { unique: true },
    },

    { collection: COLLECTIONS.INVENTORY_COUNTS, spec: { countDate: -1 } },
    {
      collection: COLLECTIONS.INVENTORY_COUNTS,
      spec: { _sanityId: 1 },
      options: { unique: true },
    },

    { collection: COLLECTIONS.FILE_ATTACHMENTS, spec: { uploadedAt: -1 } },
    {
      collection: COLLECTIONS.FILE_ATTACHMENTS,
      spec: { _sanityId: 1 },
      options: { unique: true },
    },

    { collection: COLLECTIONS.ARCHIVE_RUNS, spec: { startedAt: -1 } },
    {
      collection: COLLECTIONS.SEQUENCE_COUNTERS,
      spec: { type: 1 },
      options: { unique: true },
    },
    { collection: COLLECTIONS.STOCK_BASELINES, spec: { capturedAt: -1 } },
  ];

  let created = 0;
  const failed: { spec: string; error: string }[] = [];

  for (const { collection, spec, options } of indexSpecs) {
    const label = `${collection}.createIndex(${JSON.stringify(spec)}${
      options ? `, ${JSON.stringify(options)}` : ""
    })`;
    try {
      await db.collection(collection).createIndex(spec, options as any);
      created += 1;
    } catch (err: any) {
      const message = err?.message || String(err);
      // A genuine "index already exists with the same spec" is fine and
      // expected on every run after the first — don't log that as a
      // problem. Anything else (conflicting options, bad field path, auth,
      // timeout) is a real failure and gets logged in full, individually,
      // without blocking the remaining indexes.
      const isBenignExisting = /already exists/i.test(message);
      if (!isBenignExisting) {
        console.error(`❌ Failed to create index ${label}:`, err);
        failed.push({ spec: label, error: message });
      }
    }
  }

  if (failed.length) {
    console.error(
      `❌ ${failed.length}/${indexSpecs.length} archive indexes failed to create — see errors above.`,
    );
  } else {
    console.log(`📋 MongoDB indexes ensured (${created}/${indexSpecs.length})`);
  }

  return { created, failed };
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
  errors: string[];
}> {
  const db = await getArchiveDb();
  const cutoff = getCutoffDate();
  const cutoffDate = new Date(cutoff);

  let deletedSanityDocuments = 0;
  const errors: string[] = [];
  const collectionsToProcess = [
    { collectionName: COLLECTIONS.DISPATCH_LOGS, sanityType: "DispatchLog" },
    {
      collectionName: COLLECTIONS.PURCHASE_ORDERS,
      sanityType: "PurchaseOrder",
    },
    { collectionName: COLLECTIONS.GOODS_RECEIPTS, sanityType: "GoodsReceipt" },
    {
      collectionName: COLLECTIONS.INTERNAL_TRANSFERS,
      sanityType: "InternalTransfer",
    },
    {
      collectionName: COLLECTIONS.STOCK_ADJUSTMENTS,
      sanityType: "StockAdjustment",
    },
    {
      collectionName: COLLECTIONS.INVENTORY_COUNTS,
      sanityType: "InventoryCount",
    },
    {
      collectionName: COLLECTIONS.FILE_ATTACHMENTS,
      sanityType: "FileAttachment",
    },
    {
      collectionName: COLLECTIONS.STOCK_SNAPSHOTS,
      sanityType: "stockSnapshot",
    },
  ];

  for (const { collectionName } of collectionsToProcess) {
    let docs: any[];
    try {
      docs = await db
        .collection(collectionName)
        .find({
          _isArchived: true,
          _archivedAt: { $lt: cutoffDate.toISOString() },
        })
        .project({ _sanityId: 1 })
        .toArray();
    } catch (err: any) {
      // Don't let one collection's query failure abort every remaining
      // collection in this cleanup pass.
      console.error(
        `❌ Failed to query ${collectionName} for Sanity cleanup candidates:`,
        err,
      );
      errors.push(
        `Failed to query ${collectionName} for cleanup candidates: ${err?.message || err}`,
      );
      continue;
    }

    for (const doc of docs) {
      if (!doc._sanityId) continue;
      try {
        await withRetry(() => writeClient.delete(doc._sanityId));
        deletedSanityDocuments += 1;
      } catch (err: any) {
        if (err?.statusCode === 404) {
          deletedSanityDocuments += 1;
        } else {
          // Log the full error object (not just .message) and — critically —
          // record it in the `errors` array that's actually returned to the
          // caller. Previously this only reached an ephemeral console log;
          // the admin action would report "N documents deleted" with zero
          // indication that some documents failed to delete at all.
          console.error(
            `❌ Failed to delete Sanity document ${doc._sanityId} from ${collectionName}:`,
            err,
          );
          errors.push(
            `Failed to delete Sanity document ${doc._sanityId} (${collectionName}): ${err?.message || err}`,
          );
          continue;
        }
      }

      try {
        await db
          .collection(collectionName)
          .updateOne(
            { _sanityId: doc._sanityId },
            { $set: { _sanityDeletedAt: new Date().toISOString() } },
          );
      } catch (err: any) {
        // The Sanity document was already deleted above — if THIS write
        // fails, don't let it abort every remaining document/collection in
        // this cleanup pass. Log and record it, then keep going.
        console.error(
          `❌ Deleted Sanity document ${doc._sanityId} but failed to mark it deleted in Mongo (${collectionName}):`,
          err,
        );
        errors.push(
          `Deleted Sanity document ${doc._sanityId} (${collectionName}) but failed to record it in Mongo: ${err?.message || err}`,
        );
      }
    }
  }

  return {
    deletedSanityDocuments,
    collectionsProcessed: collectionsToProcess.length,
    cutoff,
    errors,
  };
}

const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 500;

function isRetryableError(err: any): boolean {
  if (!err) return false;

  // MongoDB driver-level transient errors. These are exactly the errors
  // seen in production ("MongoServerSelectionError: Server selection timed
  // out after 30000 ms", "connection <monitor> ... closed" with the
  // driver's own 'RetryableError'/'ResetPool' labels) — the driver itself
  // is telling us these are momentary blips, not permanent failures. They
  // typically carry no `.code` string and no HTTP-style `.statusCode`, so
  // the checks below (originally written with Sanity's HTTP API in mind)
  // never matched them, meaning this function silently returned false for
  // the single most common real-world failure this system hits.
  const labels: Set<string> | undefined = err.errorLabelSet;
  if (labels && (labels.has("RetryableError") || labels.has("ResetPool"))) {
    return true;
  }
  const errorName = err.name || "";
  if (
    errorName === "MongoServerSelectionError" ||
    errorName === "MongoNetworkError" ||
    errorName === "MongoNotConnectedError" ||
    errorName === "MongoTopologyClosedError"
  ) {
    return true;
  }
  const errorMessage = err.message || String(err);
  if (
    /server selection timed out/i.test(errorMessage) ||
    /connection.*closed/i.test(errorMessage) ||
    /topology.*closed/i.test(errorMessage) ||
    /pool.*destroyed/i.test(errorMessage)
  ) {
    return true;
  }

  if (typeof err.code === "string") {
    const code = err.code.toLowerCase();
    return [
      "etimedout",
      "econnreset",
      "enotfound",
      "eai_again",
      "sockettimeout",
    ].some((candidate) => code.includes(candidate));
  }
  const statusCode = err.statusCode || err.status;
  return statusCode === 429 || statusCode >= 500;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = DEFAULT_RETRY_ATTEMPTS,
  delayMs = DEFAULT_RETRY_DELAY_MS,
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt >= attempts || !isRetryableError(err)) break;
      const backoff = delayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  throw lastError;
}

async function updateArchiveProgress(
  progressCollection: any,
  progressId: string,
  updates: Record<string, any>,
  message?: string | { skippedItem?: any },
): Promise<void> {
  const update: any = {
    $set: {
      ...updates,
      lastUpdatedAt: new Date().toISOString(),
    },
  };

  // Support either a plain message string or a structured skippedItem object
  if (message) {
    if (typeof message === "string") {
      update.$push = { progressMessages: message };
    } else if (typeof message === "object" && message.skippedItem) {
      update.$push = {
        progressMessages: message.skippedItem.message || "Skipped item",
        skippedItems: message.skippedItem,
      };
    }
  }

  try {
    await progressCollection.updateOne({ _id: progressId } as any, update, {
      upsert: true,
    });
  } catch (err: any) {
    console.error("Failed to update archive progress:", err?.message || err);
  }
}

export interface ArchiveCurrentRunStatus {
  runId: string;
  status: "queued" | "running" | "failed" | "success" | "incomplete";
  startedAt: string;
  currentStep: string | null;
  currentStepIndex: number;
  totalSteps: number;
  completedSteps: string[];
  pendingSteps: string[];
  errors: string[];
  progressPercent: number;
  lastUpdatedAt: string;
  logs: string[];
  skippedItems?: any[];
}

export const ARCHIVE_PROGRESS_STALE_MS = 5 * 60 * 1000;

async function markStaleArchiveProgressFailed(
  progressCollection: any,
  progressId: string,
  progressDoc: any,
) {
  const staleMessage =
    "Archive progress has been stale for more than 5 minutes and has been marked failed.";
  await progressCollection.updateOne(
    { _id: progressId } as any,
    {
      $set: {
        status: "failed",
        completedAt: new Date().toISOString(),
        currentStep: null,
        currentStepIndex: progressDoc?.currentStepIndex || 0,
        completedSteps: progressDoc?.completedSteps || [],
        pendingSteps: progressDoc?.pendingSteps || [],
        errors: [...(progressDoc?.errors || []), staleMessage],
        progressPercent: progressDoc?.progressPercent || 0,
        lastUpdatedAt: new Date().toISOString(),
      },
      $push: {
        progressMessages: staleMessage,
      },
    } as any,
  );
}

function buildArchiveCurrentRunStatus(
  progressDoc: any,
): ArchiveCurrentRunStatus {
  return {
    runId: progressDoc.owner || progressDoc.runId || "archive-progress",
    status: progressDoc.status || "failed",
    startedAt:
      progressDoc.startedAt ||
      progressDoc.acquiredAt ||
      new Date().toISOString(),
    currentStep: progressDoc.currentStep || null,
    currentStepIndex: progressDoc.currentStepIndex || 0,
    totalSteps: progressDoc.totalSteps || 0,
    completedSteps: progressDoc.completedSteps || [],
    pendingSteps: progressDoc.pendingSteps || [],
    errors: progressDoc.errors || [],
    progressPercent: progressDoc.progressPercent || 0,
    lastUpdatedAt:
      progressDoc.lastUpdatedAt ||
      progressDoc.acquiredAt ||
      progressDoc.startedAt ||
      new Date().toISOString(),
    logs: progressDoc.progressMessages || [],
    skippedItems: progressDoc.skippedItems || [],
  };
}

export async function getArchiveProgress(): Promise<{
  inProgress: boolean;
  currentRun: ArchiveCurrentRunStatus | null;
  staleDetected?: boolean;
}> {
  const db = await getArchiveDb();
  const progressId = "archive-progress";
  const progressCollection = db.collection(COLLECTIONS.ARCHIVE_RUNS);
  const progressDoc = await progressCollection.findOne({
    _id: progressId,
    kind: "progress",
  } as any);

  if (!progressDoc) {
    return { inProgress: false, currentRun: null };
  }

  const lastUpdatedAt =
    progressDoc.lastUpdatedAt || progressDoc.startedAt || null;
  const lastUpdatedTs = lastUpdatedAt
    ? new Date(lastUpdatedAt).getTime()
    : null;
  const isStale =
    lastUpdatedTs && Date.now() - lastUpdatedTs > ARCHIVE_PROGRESS_STALE_MS;

  const inProgress = ["queued", "running", "incomplete"].includes(
    progressDoc.status,
  );
  if (inProgress && isStale) {
    await markStaleArchiveProgressFailed(
      progressCollection,
      progressId,
      progressDoc,
    );

    const updatedDoc = await progressCollection.findOne({
      _id: progressId,
      kind: "progress",
    } as any);

    return {
      inProgress: false,
      staleDetected: true,
      currentRun: updatedDoc ? buildArchiveCurrentRunStatus(updatedDoc) : null,
    };
  }

  if (!inProgress) {
    return { inProgress: false, currentRun: null };
  }

  return {
    inProgress,
    currentRun: buildArchiveCurrentRunStatus(progressDoc),
  };
}

export async function runArchive(
  providedRunId?: string,
): Promise<ArchiveRunResult> {
  const startedAt = new Date().toISOString();
  const runId = providedRunId || `archive-${Date.now()}`;
  const errors: string[] = [];
  // Non-fatal issues (e.g. stock baseline capture) are tracked separately so
  // they don't flip the whole run's status to "failed" — every consumer of
  // ArchiveRunResult (the run route, backup-safety gate, UI) currently keys
  // success/failure off `errors.length`, so anything pushed there IS treated
  // as fatal regardless of comments claiming otherwise.
  const warnings: string[] = [];

  console.log(`\n🗂️  Starting archive run: ${runId}`);
  console.log(
    `📅 Cutoff date: ${getCutoffDate()} (documents older than ${ARCHIVE_DAYS} days)`,
  );

  const db = await getArchiveDb();
  const indexResult = await ensureIndexes(db);
  if (indexResult.failed.length) {
    for (const f of indexResult.failed) {
      warnings.push(`Index creation failed for ${f.spec}: ${f.error}`);
    }
  }

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
      $push: {
        progressMessages: "Archive run started",
      },
    } as any,
    { upsert: true },
  );

  await updateArchiveProgress(
    progressCollection,
    progressId,
    {
      status: "running",
      runId,
      startedAt,
    },
    "Preparing archive run",
  );

  let steps: ArchiveStepResult[] = [];
  let archived: Record<string, number> = {};
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let startMs = Date.now();
  let stepFns: {
    key: string;
    name: string;
    fn: (
      db: Db,
      cutoff: string,
      errors: string[],
    ) => Promise<ArchiveStepResult>;
  }[] = [];

  appendProgress = (message: string | { skippedItem?: any }) => {
    void updateArchiveProgress(
      progressCollection,
      progressId,
      {},
      message as any,
    );
  };

  try {
    await captureStockBaseline(db).catch((err: any) => {
      const message = err?.message || String(err);
      console.error("Failed to capture stock baseline:", message);
      warnings.push(`Stock baseline capture failed: ${message}`);
      return Promise.resolve();
    });

    const cutoff = getCutoffDate();
    const maxSeconds = parseInt(process.env.ARCHIVE_MAX_SECONDS || "270", 10);
    const allowedMs = maxSeconds * 1000;
    startMs = Date.now();

    // Only skip steps that already succeeded within THIS SAME run (i.e. we are
    // resuming a specific incomplete run after a timeout). Must not match any
    // other historical run — otherwise, once a step type succeeds once, it
    // would be skipped in every future run forever, and newly-eligible
    // documents of that type would never get archived again. Must also
    // exclude the "archive-progress" singleton doc, which carries the same
    // runId (it was just stamped a few lines above) but has no `.steps`.
    const lastRun = await db.collection(COLLECTIONS.ARCHIVE_RUNS).findOne(
      { runId, _id: { $ne: progressId } },
      { sort: { startedAt: -1 } },
    );
    const completedSteps = new Set<string>();
    if (lastRun && Array.isArray(lastRun.steps)) {
      for (const s of lastRun.steps) {
        if (s?.status === "success") completedSteps.add(s.name);
      }
    }

    stepFns = [
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

    await updateArchiveProgress(
      progressCollection,
      progressId,
      {
        totalSteps: stepFns.length,
        completedSteps: [],
        pendingSteps: stepFns.map((step) => step.name),
      },
      `Archive has ${stepFns.length} steps`,
    );

    steps = [];
    archived = {};
    totalInserted = 0;
    totalUpdated = 0;
    totalSkipped = 0;

    for (const [index, step] of stepFns.entries()) {
      if (completedSteps.has(step.name)) {
        const skippedStep = createArchiveStepResult({
          name: step.name,
          count: 0,
          deletedCount: 0,
          message: "Already archived in previous successful run",
        });
        skippedStep.status = "success";
        steps.push(skippedStep);
        archived[step.key] = 0;
        continue;
      }

      const elapsed = Date.now() - startMs;
      if (elapsed >= allowedMs - 2000) {
        const partialResult: ArchiveRunResult = {
          runId,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startMs,
          archived,
          errors,
          warnings,
          skipped: totalSkipped,
          steps,
          assetsDeleted: steps.reduce(
            (sum, st) => sum + (st.assetsDeleted || 0),
            0,
          ),
          incomplete: true,
        };
        await db.collection(COLLECTIONS.ARCHIVE_RUNS).insertOne(partialResult);
        await updateArchiveProgress(
          progressCollection,
          progressId,
          {
            status: "incomplete",
            currentStep: step.name,
            currentStepIndex: index + 1,
            completedSteps: steps.map((s) => s.name),
            pendingSteps: stepFns
              .map((s) => s.name)
              .filter((name) => !steps.map((s) => s.name).includes(name)),
            errors,
            progressPercent: Math.min(
              100,
              Math.round((steps.length / stepFns.length) * 100),
            ),
          },
          `Paused due to time limit after ${steps.length} completed steps`,
        );
        console.log(
          "⚠️ Archive run paused due to time limit; will resume on next trigger",
        );
        return partialResult;
      }

      await updateArchiveProgress(
        progressCollection,
        progressId,
        {
          currentStep: step.name,
          currentStepIndex: index + 1,
        },
        `Starting step: ${step.name}`,
      );

      const stepRes = await step.fn(db, cutoff, errors).catch((err: any) => {
        const message = err?.message || String(err);
        errors.push(`${step.name} batch failed: ${message}`);
        return createArchiveStepResult({
          name: step.name,
          count: 0,
          deletedCount: 0,
          errors: [message],
          message: "Step failed",
        });
      });

      steps.push(stepRes);
      totalInserted += stepRes.inserted || 0;
      totalUpdated += stepRes.updated || 0;
      totalSkipped += stepRes.skipped || 0;
      archived[step.key] = stepRes.count || 0;

      const completedStepNames = steps
        .filter((runStep) => runStep.status === "success")
        .map((runStep) => runStep.name);
      const pendingStepNames = stepFns
        .map((s) => s.name)
        .filter((name) => !completedStepNames.includes(name));
      const progressPercent = Math.min(
        100,
        Math.round(((index + 1) / stepFns.length) * 100),
      );

      await updateArchiveProgress(
        progressCollection,
        progressId,
        {
          currentStep: step.name,
          currentStepIndex: index + 1,
          stepStatus: stepRes.status,
          completedSteps: completedStepNames,
          pendingSteps: pendingStepNames,
          errors,
          progressPercent,
        },
        `Finished step: ${step.name} — archived ${stepRes.count}, inserted ${stepRes.inserted || 0}, updated ${stepRes.updated || 0}, skipped ${stepRes.skipped || 0}`,
      );
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;
    const totalArchived = Object.values(archived).reduce(
      (sum, value) => sum + value,
      0,
    );

    const result: ArchiveRunResult = {
      runId,
      startedAt,
      completedAt,
      durationMs,
      archived,
      errors,
      warnings,
      skipped: totalSkipped,
      totalInserted,
      totalUpdated,
      totalSkipped,
      steps,
      assetsDeleted: steps.reduce(
        (sum, step) => sum + (step.assetsDeleted || 0),
        0,
      ),
      incomplete: false,
    };

    await db.collection(COLLECTIONS.ARCHIVE_RUNS).insertOne(result);
    await updateArchiveProgress(
      progressCollection,
      progressId,
      {
        status: result.errors.length ? "failed" : "success",
        completedAt: result.completedAt,
        currentStep: null,
        currentStepIndex: stepFns.length,
        completedSteps: stepFns.map((step) => step.name),
        pendingSteps: [],
        errors,
        progressPercent: 100,
      },
      `Archive run complete: ${totalArchived} documents archived.`,
    );

    console.log(
      `\n🎉 Archive run complete: ${totalArchived} documents archived in ${durationMs}ms`,
    );
    if (errors.length)
      console.error(`⚠️  ${errors.length} errors occurred:`, errors);

    return result;
  } catch (err: any) {
    const message = err?.message || String(err);
    // Log the FULL error — stack trace, name, and any structured detail
    // (MongoDB errors carry .code / .errorLabelSet, Sanity errors carry
    // .statusCode / .response) — not just `.message`, which frequently
    // isn't enough on its own to diagnose why a run actually failed.
    console.error("❌ Archive run failed with exception:", err);
    if (err?.stack) console.error(err.stack);
    errors.push(`Archive run failed: ${message}`);

    const failedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;
    const failedResult: ArchiveRunResult = {
      runId,
      startedAt,
      completedAt: failedAt,
      durationMs,
      archived,
      errors,
      warnings,
      skipped: totalSkipped,
      totalInserted,
      totalUpdated,
      totalSkipped,
      steps,
      assetsDeleted: steps.reduce(
        (sum, step) => sum + (step.assetsDeleted || 0),
        0,
      ),
      incomplete: false,
    };

    await db.collection(COLLECTIONS.ARCHIVE_RUNS).insertOne(failedResult);
    await updateArchiveProgress(
      progressCollection,
      progressId,
      {
        status: "failed",
        completedAt: failedAt,
        currentStep: null,
        currentStepIndex: steps.length,
        completedSteps: steps.map((s) => s.name),
        pendingSteps: stepFns
          .map((s) => s.name)
          .filter((name) => !steps.map((s) => s.name).includes(name)),
        errors,
        progressPercent: Math.min(
          100,
          Math.round((steps.length / stepFns.length) * 100),
        ),
      },
      `Archive run failed: ${message}`,
    );

    throw err;
  } finally {
    appendProgress = undefined;
  }
}

export async function resumeIncompleteArchives(
  maxAttempts: number = 5,
): Promise<{ attempts: number; finished: boolean }> {
  const db = await getArchiveDb();
  let attempts = 0;

  for (; attempts < maxAttempts; attempts += 1) {
    const incompleteRun = await db
      .collection(COLLECTIONS.ARCHIVE_RUNS)
      .findOne({ incomplete: true }, { sort: { startedAt: -1 } });

    if (!incompleteRun) return { attempts, finished: true };

    console.log(
      `🔁 Resuming incomplete archive run (found: ${incompleteRun.runId})`,
    );

    // Pass the original runId so resumed run updates the same progress record
    const res = await runArchive(incompleteRun.runId);

    if (!res.incomplete) {
      await db
        .collection(COLLECTIONS.ARCHIVE_RUNS)
        .updateMany(
          { incomplete: true, runId: { $ne: res.runId } },
          { $set: { incomplete: false } },
        );
    }

    const remaining = await db
      .collection(COLLECTIONS.ARCHIVE_RUNS)
      .findOne({ incomplete: true });
    if (!remaining) return { attempts: attempts + 1, finished: true };
  }

  return { attempts, finished: false };
}
