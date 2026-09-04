// Unit tests for the pure/mockable parts of the archive engine —
// stableSerialize/normalizeForComparison and insertIfNotExists. These run
// against a mocked Mongo `Db` and mocked Sanity client; no live connection
// is ever made (see the jest.mock calls below), so this is safe to run
// against any environment, including one whose .env points at production.

jest.mock("@/lib/sanity", () => ({
  client: {},
  writeClient: { delete: jest.fn() },
}));

// next-sanity ships ESM-only, which Jest can't parse under the default
// transformIgnorePatterns — archiveService.ts only uses `groq` as a
// template-tag for building query strings, which none of the functions
// under test here actually execute, so a trivial stand-in is enough.
jest.mock("next-sanity", () => ({
  groq: (strings: TemplateStringsArray, ...values: any[]) =>
    strings.reduce((acc, s, i) => acc + s + (values[i] ?? ""), ""),
}));

// The mongodb driver's bson dependency ships an ESM .mjs build that Jest's
// default transform can't parse either. archiveService.ts only uses
// `ObjectId` as a value import (Db is type-only), and none of the functions
// under test here construct one, so a trivial stand-in is enough.
jest.mock("mongodb", () => ({
  ObjectId: function ObjectId(id?: any) {
    return { toString: () => String(id ?? "") };
  },
}));

jest.mock("@/lib/mongoClient", () => ({
  getArchiveDb: jest.fn(),
  COLLECTIONS: {
    DISPATCH_LOGS: "archived_dispatch_logs",
    PURCHASE_ORDERS: "archived_purchase_orders",
    GOODS_RECEIPTS: "archived_goods_receipts",
    INTERNAL_TRANSFERS: "archived_internal_transfers",
    STOCK_ADJUSTMENTS: "archived_stock_adjustments",
    INVENTORY_COUNTS: "archived_inventory_counts",
    FILE_ATTACHMENTS: "archived_file_attachments",
    STOCK_SNAPSHOTS: "archived_stock_snapshots",
    ARCHIVE_RUNS: "archive_runs",
    SEQUENCE_COUNTERS: "sequence_counters",
    STOCK_BASELINES: "stock_baselines",
  },
}));

import {
  normalizeForComparison,
  stableSerialize,
  insertIfNotExists,
} from "@/lib/archiveService";

describe("normalizeForComparison / stableSerialize", () => {
  it("produces identical output regardless of top-level key order", () => {
    const a = { foo: 1, bar: { z: 1, a: 2 } };
    const b = { bar: { a: 2, z: 1 }, foo: 1 };
    expect(stableSerialize(a)).toBe(stableSerialize(b));
  });

  it("distinguishes objects with different values", () => {
    expect(stableSerialize({ foo: 1 })).not.toBe(stableSerialize({ foo: 2 }));
  });

  it("sorts keys inside objects nested in arrays too", () => {
    const a = [{ b: 1, a: 2 }];
    const b = [{ a: 2, b: 1 }];
    expect(stableSerialize(a)).toBe(stableSerialize(b));
  });

  it("passes through primitives, null and undefined", () => {
    expect(normalizeForComparison(null)).toBeNull();
    expect(normalizeForComparison(undefined)).toBeUndefined();
    expect(normalizeForComparison(5)).toBe(5);
    expect(normalizeForComparison("x")).toBe("x");
  });
});

function createMockDb(existingDocs: any[] = []) {
  const bulkWrite = jest.fn().mockResolvedValue({ ok: 1 });
  const find = jest.fn().mockReturnValue({
    toArray: jest.fn().mockResolvedValue(existingDocs),
  });
  const collection = jest.fn().mockReturnValue({ find, bulkWrite });
  return { db: { collection } as any, bulkWrite, find };
}

describe("insertIfNotExists", () => {
  it("inserts brand-new documents", async () => {
    const { db, bulkWrite } = createMockDb([]);
    const errors: string[] = [];

    const result = await insertIfNotExists(
      db,
      "archived_dispatch_logs",
      [{ _id: "doc-1", dispatchNumber: "D-1" }],
      errors,
    );

    expect(result).toEqual({ inserted: 1, updated: 0, skipped: 0 });
    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const ops = bulkWrite.mock.calls[0][0];
    expect(ops[0].insertOne.document._sanityId).toBe("doc-1");
    expect(errors).toEqual([]);
  });

  it("skips documents that are unchanged, even if key order differs", async () => {
    const existing = {
      _id: "mongo-1",
      _sanityId: "doc-1",
      dispatchNumber: "D-1",
      status: "completed",
      _isArchived: true,
    };
    const { db, bulkWrite } = createMockDb([existing]);

    // Same content as `existing`, just different key order.
    const result = await insertIfNotExists(
      db,
      "archived_dispatch_logs",
      [{ status: "completed", _id: "doc-1", dispatchNumber: "D-1" }],
      [],
    );

    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 1 });
    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it("updates documents whose content actually changed", async () => {
    const existing = {
      _id: "mongo-1",
      _sanityId: "doc-1",
      dispatchNumber: "D-1",
      status: "draft",
      _isArchived: true,
    };
    const { db, bulkWrite } = createMockDb([existing]);

    const result = await insertIfNotExists(
      db,
      "archived_dispatch_logs",
      [{ _id: "doc-1", dispatchNumber: "D-1", status: "completed" }],
      [],
    );

    expect(result).toEqual({ inserted: 0, updated: 1, skipped: 0 });
    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const ops = bulkWrite.mock.calls[0][0];
    expect(ops[0].replaceOne.filter).toEqual({ _sanityId: "doc-1" });
    expect(ops[0].replaceOne.replacement.status).toBe("completed");
  });

  it("skips documents with no resolvable Sanity id, without touching the db", async () => {
    const { db, bulkWrite, find } = createMockDb([]);

    const result = await insertIfNotExists(
      db,
      "archived_dispatch_logs",
      [{ dispatchNumber: "no-id-here" }],
      [],
    );

    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 1 });
    expect(find).not.toHaveBeenCalled();
    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it("returns immediately for an empty docs array without touching the db", async () => {
    const { db, bulkWrite, find } = createMockDb([]);

    const result = await insertIfNotExists(
      db,
      "archived_dispatch_logs",
      [],
      [],
    );

    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 0 });
    expect(find).not.toHaveBeenCalled();
    expect(bulkWrite).not.toHaveBeenCalled();
  });
});
