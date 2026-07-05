import { getArchiveDb, COLLECTIONS } from "@/lib/mongoClient";
import { insertIfNotExists } from "@/lib/archiveService";

export interface ArchiveUploadLineResult {
  lineNumber: number;
  sanityId: string | null;
  type: string | null;
  expectedCollection: string | null;
  status:
    | "valid"
    | "missing"
    | "invalid_json"
    | "invalid_document"
    | "found_in_unexpected_collection";
  reason: string;
  foundIn?: string[];
}

export interface ArchiveUploadValidationResult {
  totalLines: number;
  parsedLines: number;
  validDocuments: number;
  missingDocuments: number;
  invalidLines: number;
  unknownTypes: number;
  durationMs: number;
  summary: {
    totalLines: number;
    parsedLines: number;
    validDocuments: number;
    missingDocuments: number;
    invalidLines: number;
    unknownTypes: number;
  };
  lineResults: ArchiveUploadLineResult[];
}

export interface ArchiveUploadProgressEvent {
  type: "progress" | "final";
  linesProcessed: number;
  batchLines?: number;
  validDocuments: number;
  missingDocuments: number;
  invalidLines: number;
  unknownTypes: number;
  message: string;
  result?: ArchiveUploadValidationResult;
}

const TYPE_TO_COLLECTION: Record<string, string> = {
  dispatchlog: COLLECTIONS.DISPATCH_LOGS,
  purchaseorder: COLLECTIONS.PURCHASE_ORDERS,
  goodsreceipt: COLLECTIONS.GOODS_RECEIPTS,
  internaltransfer: COLLECTIONS.INTERNAL_TRANSFERS,
  inventorycount: COLLECTIONS.INVENTORY_COUNTS,
  stockadjustment: COLLECTIONS.STOCK_ADJUSTMENTS,
  fileattachment: COLLECTIONS.FILE_ATTACHMENTS,
  stocksnapshot: COLLECTIONS.STOCK_SNAPSHOTS,
};

const ARCHIVE_COLLECTIONS: string[] = [
  COLLECTIONS.DISPATCH_LOGS,
  COLLECTIONS.PURCHASE_ORDERS,
  COLLECTIONS.GOODS_RECEIPTS,
  COLLECTIONS.INTERNAL_TRANSFERS,
  COLLECTIONS.STOCK_ADJUSTMENTS,
  COLLECTIONS.INVENTORY_COUNTS,
  COLLECTIONS.FILE_ATTACHMENTS,
  COLLECTIONS.STOCK_SNAPSHOTS,
];

function normalizeType(type: unknown): string | null {
  if (!type) return null;
  return String(type).trim().toLowerCase();
}

function getCollectionForType(type: unknown): string | null {
  const normalized = normalizeType(type);
  if (!normalized) return null;
  return TYPE_TO_COLLECTION[normalized] || null;
}

interface ParsedLine {
  lineNumber: number;
  originalText: string;
  sanityId: string | null;
  type: string | null;
  expectedCollection: string | null;
  parsedDocument?: any;
  invalidReason?: string;
}

const VALIDATION_BATCH_SIZE = 500;

async function* createLineIterator(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      let line = buffer.slice(0, newlineIndex);
      if (line.endsWith("\r")) {
        line = line.slice(0, -1);
      }
      yield line;
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  if (buffer.length > 0) {
    yield buffer;
  }
}

async function processBatch(
  db: any,
  parsedBatch: ParsedLine[],
): Promise<ArchiveUploadLineResult[]> {
  if (parsedBatch.length === 0) return [];

  const collectionIdsMap = new Map<string, Set<string>>();
  const idsNeedingSearch = new Set<string>();

  parsedBatch.forEach((parsed) => {
    if (!parsed.sanityId) return;
    if (parsed.expectedCollection) {
      const set = collectionIdsMap.get(parsed.expectedCollection) || new Set();
      set.add(parsed.sanityId);
      collectionIdsMap.set(parsed.expectedCollection, set);
    } else {
      idsNeedingSearch.add(parsed.sanityId);
    }
  });

  const foundByCollection = new Map<string, Set<string>>();
  const foundInAnyCollection = new Map<string, string[]>();

  await Promise.all(
    Array.from(collectionIdsMap.entries()).map(async ([collection, ids]) => {
      if (ids.size === 0) return;
      const records = await db
        .collection(collection)
        .find({ _sanityId: { $in: Array.from(ids) } })
        .project({ _sanityId: 1 })
        .toArray();

      const found = new Set<string>(
        records.map((doc: any) => String(doc._sanityId)),
      );
      foundByCollection.set(collection, found);

      records.forEach((doc: any) => {
        const id = String(doc._sanityId);
        const existing = foundInAnyCollection.get(id) || [];
        if (!existing.includes(collection)) {
          existing.push(collection);
          foundInAnyCollection.set(id, existing);
        }
      });
    }),
  );

  parsedBatch.forEach((entry) => {
    if (!entry.sanityId) return;
    const expected = entry.expectedCollection;
    if (expected) {
      const foundSet = foundByCollection.get(expected);
      if (!foundSet || !foundSet.has(entry.sanityId)) {
        idsNeedingSearch.add(entry.sanityId);
      }
    }
  });

  if (idsNeedingSearch.size > 0) {
    const idsToSearchArray = Array.from(idsNeedingSearch);
    await Promise.all(
      ARCHIVE_COLLECTIONS.map(async (collection) => {
        const docs = await db
          .collection(collection)
          .find({ _sanityId: { $in: idsToSearchArray } })
          .project({ _sanityId: 1 })
          .toArray();

        docs.forEach((doc: any) => {
          const id = String(doc._sanityId);
          const existing = foundInAnyCollection.get(id) || [];
          if (!existing.includes(collection)) {
            existing.push(collection);
            foundInAnyCollection.set(id, existing);
          }
        });
      }),
    );
  }

  return parsedBatch.map((entry) => {
    if (!entry.sanityId) {
      return {
        lineNumber: entry.lineNumber,
        sanityId: null,
        type: entry.type,
        expectedCollection: entry.expectedCollection,
        status: "invalid_document",
        reason: entry.invalidReason || "Document is missing _id or _sanityId",
      };
    }

    const foundCollections = foundInAnyCollection.get(entry.sanityId) || [];
    const expected = entry.expectedCollection;
    const foundInExpected = expected
      ? foundByCollection.get(expected)?.has(entry.sanityId)
      : false;

    if (expected && foundInExpected) {
      return {
        lineNumber: entry.lineNumber,
        sanityId: entry.sanityId,
        type: entry.type,
        expectedCollection: expected,
        status: "valid",
        reason: `Found in expected archive collection ${expected}`,
        foundIn: foundCollections,
      };
    }

    if (foundCollections.length > 0) {
      return {
        lineNumber: entry.lineNumber,
        sanityId: entry.sanityId,
        type: entry.type,
        expectedCollection: expected,
        status: "found_in_unexpected_collection",
        reason: expected
          ? `Found in ${foundCollections.join(", ")} instead of expected ${expected}`
          : `Found in ${foundCollections.join(", ")}`,
        foundIn: foundCollections,
      };
    }

    return {
      lineNumber: entry.lineNumber,
      sanityId: entry.sanityId,
      type: entry.type,
      expectedCollection: expected,
      status: "missing",
      reason: `No archived document found for _sanityId ${entry.sanityId}`,
    };
  });
}

export async function* validateArchiveUploadFileStreamEvents(
  stream: ReadableStream<Uint8Array>,
  options?: { insertMissing?: boolean },
): AsyncGenerator<ArchiveUploadProgressEvent> {
  const startTime = Date.now();
  const db = await getArchiveDb();

  const lineResults: ArchiveUploadLineResult[] = [];
  const parsedBatch: ParsedLine[] = [];
  let totalLines = 0;
  let parsedLines = 0;
  let invalidLines = 0;
  let unknownTypes = 0;
  let currentLineNumber = 0;

  for await (const line of createLineIterator(stream)) {
    currentLineNumber += 1;
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }

    totalLines += 1;
    const lineNumber = currentLineNumber;

    try {
      const document = JSON.parse(trimmed);
      const sanityId =
        document?._sanityId || document?._id || document?.id || null;
      const type = document?._type || document?.type || null;
      const expectedCollection = getCollectionForType(type);

      if (!sanityId) {
        invalidLines += 1;
        lineResults.push({
          lineNumber,
          sanityId: null,
          type: type ? String(type) : null,
          expectedCollection,
          status: "invalid_document",
          reason: "Document is missing _id or _sanityId",
        });
      } else {
        parsedLines += 1;
        if (!expectedCollection) {
          unknownTypes += 1;
        }

        parsedBatch.push({
          lineNumber,
          originalText: trimmed,
          sanityId: String(sanityId),
          type: type ? String(type) : null,
          expectedCollection,
          parsedDocument: document,
        });
      }
    } catch (error: any) {
      invalidLines += 1;
      lineResults.push({
        lineNumber,
        sanityId: null,
        type: null,
        expectedCollection: null,
        status: "invalid_json",
        reason: `Failed to parse JSON: ${error?.message || "Unknown error"}`,
      });
    }

    if (parsedBatch.length >= VALIDATION_BATCH_SIZE) {
      const batchResults = await processBatch(db, parsedBatch);

      // If requested, insert missing documents found in this batch
      if (options?.insertMissing) {
        const missing = batchResults.filter((r) => r.status === "missing");
        if (missing.length > 0) {
          const docsByCollection = new Map<string, any[]>();
          missing.forEach((m) => {
            const parsed = parsedBatch.find(
              (p) => p.lineNumber === m.lineNumber,
            );
            if (!parsed || !parsed.parsedDocument) return;
            const coll = parsed.expectedCollection;
            if (!coll) return; // skip unknown types
            const arr = docsByCollection.get(coll) || [];
            arr.push(parsed.parsedDocument);
            docsByCollection.set(coll, arr);
          });

          for (const [coll, docs] of docsByCollection.entries()) {
            try {
              const res = await insertIfNotExists(db, coll, docs, [], () => {
                /* progress callback ignored here */
              });
              // mark corresponding batchResults as inserted/valid
              missing.forEach((m) => {
                const parsed = parsedBatch.find(
                  (p) => p.lineNumber === m.lineNumber,
                );
                if (parsed && parsed.expectedCollection === coll) {
                  const br = batchResults.find(
                    (b) => b.lineNumber === m.lineNumber,
                  );
                  if (br) {
                    br.status = "valid";
                    br.reason = `Inserted into ${coll}`;
                    br.foundIn = [coll];
                  }
                }
              });
              yield {
                type: "progress",
                linesProcessed: totalLines,
                batchLines: docs.length,
                validDocuments:
                  lineResults.filter((item) => item.status === "valid").length +
                  res.inserted,
                missingDocuments: Math.max(
                  0,
                  lineResults.filter((item) => item.status === "missing")
                    .length - res.inserted,
                ),
                invalidLines,
                unknownTypes,
                message: `Inserted ${res.inserted} missing documents into ${coll}`,
              };
            } catch (err: any) {
              // report insertion error as progress event of type error
              yield {
                type: "progress",
                linesProcessed: totalLines,
                batchLines: docs.length,
                validDocuments: lineResults.filter(
                  (item) => item.status === "valid",
                ).length,
                missingDocuments: lineResults.filter(
                  (item) => item.status === "missing",
                ).length,
                invalidLines,
                unknownTypes,
                message: `Failed to insert missing documents into ${coll}: ${err?.message || err}`,
              };
            }
          }
        }
      }

      lineResults.push(...batchResults);
      parsedBatch.length = 0;
      yield {
        type: "progress",
        linesProcessed: totalLines,
        batchLines: VALIDATION_BATCH_SIZE,
        validDocuments: lineResults.filter((item) => item.status === "valid")
          .length,
        missingDocuments: lineResults.filter(
          (item) => item.status === "missing",
        ).length,
        invalidLines,
        unknownTypes,
        message: `Processed ${totalLines} lines`,
      };
    }
  }

  if (parsedBatch.length > 0) {
    const batchResults = await processBatch(db, parsedBatch);

    if (options?.insertMissing) {
      const missing = batchResults.filter((r) => r.status === "missing");
      if (missing.length > 0) {
        const docsByCollection = new Map<string, any[]>();
        missing.forEach((m) => {
          const parsed = parsedBatch.find((p) => p.lineNumber === m.lineNumber);
          if (!parsed || !parsed.parsedDocument) return;
          const coll = parsed.expectedCollection;
          if (!coll) return;
          const arr = docsByCollection.get(coll) || [];
          arr.push(parsed.parsedDocument);
          docsByCollection.set(coll, arr);
        });

        for (const [coll, docs] of docsByCollection.entries()) {
          try {
            const res = await insertIfNotExists(db, coll, docs, [], () => {});
            missing.forEach((m) => {
              const parsed = parsedBatch.find(
                (p) => p.lineNumber === m.lineNumber,
              );
              if (parsed && parsed.expectedCollection === coll) {
                const br = batchResults.find(
                  (b) => b.lineNumber === m.lineNumber,
                );
                if (br) {
                  br.status = "valid";
                  br.reason = `Inserted into ${coll}`;
                  br.foundIn = [coll];
                }
              }
            });
            yield {
              type: "progress",
              linesProcessed: totalLines,
              batchLines: docs.length,
              validDocuments:
                lineResults.filter((item) => item.status === "valid").length +
                res.inserted,
              missingDocuments: Math.max(
                0,
                lineResults.filter((item) => item.status === "missing").length -
                  res.inserted,
              ),
              invalidLines,
              unknownTypes,
              message: `Inserted ${res.inserted} missing documents into ${coll}`,
            };
          } catch (err: any) {
            yield {
              type: "progress",
              linesProcessed: totalLines,
              batchLines: docs.length,
              validDocuments: lineResults.filter(
                (item) => item.status === "valid",
              ).length,
              missingDocuments: lineResults.filter(
                (item) => item.status === "missing",
              ).length,
              invalidLines,
              unknownTypes,
              message: `Failed to insert missing documents into ${coll}: ${err?.message || err}`,
            };
          }
        }
      }
    }

    lineResults.push(...batchResults);
    yield {
      type: "progress",
      linesProcessed: totalLines,
      batchLines: parsedBatch.length,
      validDocuments: lineResults.filter((item) => item.status === "valid")
        .length,
      missingDocuments: lineResults.filter((item) => item.status === "missing")
        .length,
      invalidLines,
      unknownTypes,
      message: `Processed ${totalLines} lines`,
    };
  }

  lineResults.sort((a, b) => a.lineNumber - b.lineNumber);

  const validDocuments = lineResults.filter(
    (item) => item.status === "valid",
  ).length;
  const missingDocuments = lineResults.filter(
    (item) => item.status === "missing",
  ).length;

  const finalResult: ArchiveUploadValidationResult = {
    totalLines,
    parsedLines,
    validDocuments,
    missingDocuments,
    invalidLines,
    unknownTypes,
    durationMs: Date.now() - startTime,
    summary: {
      totalLines,
      parsedLines,
      validDocuments,
      missingDocuments,
      invalidLines,
      unknownTypes,
    },
    lineResults,
  };

  yield {
    type: "final",
    linesProcessed: totalLines,
    validDocuments,
    missingDocuments,
    invalidLines,
    unknownTypes,
    message: "Validation complete",
    result: finalResult,
  };
}

export async function validateArchiveUploadFileStream(
  stream: ReadableStream<Uint8Array>,
): Promise<ArchiveUploadValidationResult> {
  const generator = validateArchiveUploadFileStreamEvents(stream);
  let finalResult: ArchiveUploadValidationResult | null = null;

  for await (const event of generator) {
    if (event.type === "final" && event.result) {
      finalResult = event.result;
    }
  }

  if (!finalResult) {
    throw new Error("Failed to produce final validation result");
  }

  return finalResult;
}

export async function validateArchiveUploadFileContent(
  fileContent: string,
): Promise<ArchiveUploadValidationResult> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(fileContent));
      controller.close();
    },
  });

  return validateArchiveUploadFileStream(stream);
}
