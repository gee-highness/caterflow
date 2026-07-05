import { getArchiveDb, COLLECTIONS } from "@/lib/mongoClient";

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
  invalidReason?: string;
}

export async function validateArchiveUploadFileContent(
  fileContent: string,
): Promise<ArchiveUploadValidationResult> {
  const startTime = Date.now();
  const lines = fileContent.split(/\r?\n/);

  const parsedLines: ParsedLine[] = [];
  const invalidLines: ArchiveUploadLineResult[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    const lineNumber = index + 1;

    if (trimmed === "") {
      continue;
    }

    try {
      const document = JSON.parse(trimmed);
      const sanityId =
        document?._sanityId || document?._id || document?.id || null;
      const type = document?._type || document?.type || null;
      const expectedCollection = getCollectionForType(type);

      if (!sanityId) {
        invalidLines.push({
          lineNumber,
          sanityId: null,
          type: type ? String(type) : null,
          expectedCollection,
          status: "invalid_document",
          reason: "Document is missing _id or _sanityId",
        });
        continue;
      }

      parsedLines.push({
        lineNumber,
        originalText: trimmed,
        sanityId: String(sanityId),
        type: type ? String(type) : null,
        expectedCollection,
      });
    } catch (error: any) {
      invalidLines.push({
        lineNumber,
        sanityId: null,
        type: null,
        expectedCollection: null,
        status: "invalid_json",
        reason: `Failed to parse JSON: ${error?.message || "Unknown error"}`,
      });
    }
  }

  const db = await getArchiveDb();
  const collectionIdsMap = new Map<string, Set<string>>();

  parsedLines.forEach((parsed) => {
    if (parsed.expectedCollection) {
      const set = collectionIdsMap.get(parsed.expectedCollection) || new Set();
      set.add(parsed.sanityId as string);
      collectionIdsMap.set(parsed.expectedCollection, set);
    }
  });

  const foundByCollection = new Map<string, Set<string>>();
  const foundInAnyCollection = new Map<string, string[]>();

  // First check the expected collection for entries with a known type.
  for (const [collection, ids] of collectionIdsMap.entries()) {
    if (ids.size === 0) continue;
    const records = await db
      .collection(collection)
      .find({ _sanityId: { $in: Array.from(ids) } })
      .project({ _sanityId: 1 })
      .toArray();

    const found = new Set(records.map((doc) => String(doc._sanityId)));
    foundByCollection.set(collection, found);

    for (const foundId of found) {
      const existing = foundInAnyCollection.get(foundId) || [];
      if (!existing.includes(collection)) {
        existing.push(collection);
        foundInAnyCollection.set(foundId, existing);
      }
    }
  }

  // Collect IDs that still need a wider search.
  const idsToSearch = new Set<string>();
  parsedLines.forEach((entry) => {
    if (!entry.expectedCollection) {
      idsToSearch.add(entry.sanityId as string);
      return;
    }

    const foundSet = foundByCollection.get(entry.expectedCollection);
    if (!foundSet || !foundSet.has(entry.sanityId as string)) {
      idsToSearch.add(entry.sanityId as string);
    }
  });

  const idsToSearchArray = Array.from(idsToSearch);

  if (idsToSearchArray.length > 0) {
    await Promise.all(
      ARCHIVE_COLLECTIONS.map(async (collection) => {
        const docs = await db
          .collection(collection)
          .find({ _sanityId: { $in: idsToSearchArray } })
          .project({ _sanityId: 1 })
          .toArray();

        docs.forEach((doc) => {
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

  const lineResults: ArchiveUploadLineResult[] = [];

  parsedLines.forEach((entry) => {
    const foundCollections =
      foundInAnyCollection.get(entry.sanityId as string) || [];
    const expected = entry.expectedCollection;

    if (
      expected &&
      foundByCollection.get(expected)?.has(entry.sanityId as string)
    ) {
      lineResults.push({
        lineNumber: entry.lineNumber,
        sanityId: entry.sanityId,
        type: entry.type,
        expectedCollection: expected,
        status: "valid",
        reason: `Found in expected archive collection ${expected}`,
        foundIn: foundCollections,
      });
      return;
    }

    if (foundCollections.length > 0) {
      lineResults.push({
        lineNumber: entry.lineNumber,
        sanityId: entry.sanityId,
        type: entry.type,
        expectedCollection: expected,
        status: "found_in_unexpected_collection",
        reason: expected
          ? `Found in ${foundCollections.join(", ")} instead of expected ${expected}`
          : `Found in ${foundCollections.join(", ")}`,
        foundIn: foundCollections,
      });
      return;
    }

    lineResults.push({
      lineNumber: entry.lineNumber,
      sanityId: entry.sanityId,
      type: entry.type,
      expectedCollection: expected,
      status: "missing",
      reason: `No archived document found for _sanityId ${entry.sanityId}`,
    });
  });

  const allResults = [...invalidLines, ...lineResults].sort(
    (a, b) => a.lineNumber - b.lineNumber,
  );

  const totalLines = lines.filter((line) => line.trim() !== "").length;
  const result: ArchiveUploadValidationResult = {
    totalLines,
    parsedLines: parsedLines.length,
    validDocuments: lineResults.filter((item) => item.status === "valid")
      .length,
    missingDocuments: lineResults.filter((item) => item.status === "missing")
      .length,
    invalidLines: invalidLines.length,
    unknownTypes: parsedLines.filter((item) => !item.expectedCollection).length,
    durationMs: Date.now() - startTime,
    summary: {
      totalLines,
      parsedLines: parsedLines.length,
      validDocuments: lineResults.filter((item) => item.status === "valid")
        .length,
      missingDocuments: lineResults.filter((item) => item.status === "missing")
        .length,
      invalidLines: invalidLines.length,
      unknownTypes: parsedLines.filter((item) => !item.expectedCollection)
        .length,
    },
    lineResults: allResults,
  };

  return result;
}
