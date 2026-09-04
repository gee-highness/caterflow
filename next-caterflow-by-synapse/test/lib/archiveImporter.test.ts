// Unit tests for the backup restore/diff logic in archiveImporter.ts,
// against a mocked Mongo `Db` — no live connection is ever made.

// archiveImporter.ts pulls in archiveService.ts (for stableSerialize), which
// transitively imports @/lib/sanity and next-sanity — the latter ships
// ESM-only and can't be parsed under Jest's default transform config, and
// none of it is actually exercised by computeDiffAndApply, so stub both out.
jest.mock("@/lib/sanity", () => ({
  client: {},
  writeClient: { delete: jest.fn() },
}));
jest.mock("next-sanity", () => ({
  groq: (strings: TemplateStringsArray, ...values: any[]) =>
    strings.reduce((acc, s, i) => acc + s + (values[i] ?? ""), ""),
}));
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

import { computeDiffAndApply } from "@/lib/archiveImporter";
import { getArchiveDb } from "@/lib/mongoClient";

const ALL_COLLECTION_NAMES = [
  "archived_dispatch_logs",
  "archived_purchase_orders",
  "archived_goods_receipts",
  "archived_internal_transfers",
  "archived_stock_adjustments",
  "archived_inventory_counts",
  "archived_file_attachments",
  "archived_stock_snapshots",
  "archive_runs",
  "sequence_counters",
  "stock_baselines",
];

function emptyBackupData(): Record<string, any[]> {
  return Object.fromEntries(ALL_COLLECTION_NAMES.map((n) => [n, []]));
}

type CollectionCalls = { deleteMany: number; insertManyArgs: any[][] };

function createMockDb(currentDocsByCollection: Record<string, any[]>) {
  const calls: Record<string, CollectionCalls> = {};

  const collection = jest.fn((name: string) => {
    if (!calls[name]) calls[name] = { deleteMany: 0, insertManyArgs: [] };
    return {
      find: () => ({
        toArray: async () => currentDocsByCollection[name] ?? [],
      }),
      deleteMany: jest.fn(async () => {
        calls[name].deleteMany += 1;
        return { ok: 1 };
      }),
      insertMany: jest.fn(async (docs: any[]) => {
        calls[name].insertManyArgs.push(docs);
        return { ok: 1 };
      }),
      insertOne: jest.fn(async () => ({ insertedId: "audit-1" })),
    };
  });

  return { db: { collection } as any, calls };
}

describe("computeDiffAndApply", () => {
  beforeEach(() => {
    (getArchiveDb as jest.Mock).mockReset();
  });

  it("computes added/removed/updated counts without mutating anything in dry-run mode", async () => {
    const { db, calls } = createMockDb({
      archived_dispatch_logs: [
        { _sanityId: "keep-1", status: "completed" }, // present in both -> unchanged
        { _sanityId: "remove-me", status: "completed" }, // only in current -> removed
      ],
    });
    (getArchiveDb as jest.Mock).mockResolvedValue(db);

    const backup = {
      data: {
        ...emptyBackupData(),
        archived_dispatch_logs: [
          { _sanityId: "keep-1", status: "completed" },
          { _sanityId: "new-1", status: "completed" }, // only in backup -> added
        ],
      },
    };

    const result = await computeDiffAndApply(backup, false);

    expect(result.applied).toBe(false);
    expect(result.diff["archived_dispatch_logs"]).toEqual({
      added: 1,
      removed: 1,
      updated: 0,
    });
    expect(calls["archived_dispatch_logs"].deleteMany).toBe(0);
    expect(calls["archived_dispatch_logs"].insertManyArgs).toEqual([]);
  });

  it("replaces a collection's contents when applying and the backup explicitly includes it", async () => {
    const { db, calls } = createMockDb({
      archived_dispatch_logs: [{ _sanityId: "old-1", status: "completed" }],
    });
    (getArchiveDb as jest.Mock).mockResolvedValue(db);

    const backup = {
      data: {
        ...emptyBackupData(),
        archived_dispatch_logs: [{ _sanityId: "new-1", status: "completed" }],
      },
    };

    const result = await computeDiffAndApply(backup, true);

    expect(result.applied).toBe(true);
    expect(calls["archived_dispatch_logs"].deleteMany).toBe(1);
    expect(calls["archived_dispatch_logs"].insertManyArgs).toEqual([
      [{ _sanityId: "new-1", status: "completed" }],
    ]);
  });

  it("does NOT wipe a collection the backup file doesn't mention at all (regression)", async () => {
    // A backup taken before this collection existed (or a partial export)
    // must never be treated as "restore this collection to empty" — that
    // would silently delete live data with nothing to put back in its place.
    const { db, calls } = createMockDb({
      archived_dispatch_logs: [
        { _sanityId: "still-here", status: "completed" },
      ],
    });
    (getArchiveDb as jest.Mock).mockResolvedValue(db);

    const backupData = emptyBackupData();
    delete backupData["archived_dispatch_logs"]; // key absent entirely
    const backup = { data: backupData };

    const result = await computeDiffAndApply(backup, true);

    expect(result.diff["archived_dispatch_logs"].skippedNotInBackup).toBe(
      true,
    );
    expect(calls["archived_dispatch_logs"].deleteMany).toBe(0);
    expect(calls["archived_dispatch_logs"].insertManyArgs).toEqual([]);
  });

  it("wipes a collection to empty when the backup explicitly includes it as an empty array", async () => {
    const { db, calls } = createMockDb({
      archived_dispatch_logs: [{ _sanityId: "old-1", status: "completed" }],
    });
    (getArchiveDb as jest.Mock).mockResolvedValue(db);

    // Every collection explicitly present, all empty — a real "everything
    // restored to empty" backup, as opposed to a partial export.
    const backup = { data: emptyBackupData() };

    const result = await computeDiffAndApply(backup, true);

    expect(
      result.diff["archived_dispatch_logs"].skippedNotInBackup,
    ).toBeUndefined();
    expect(calls["archived_dispatch_logs"].deleteMany).toBe(1);
    expect(calls["archived_dispatch_logs"].insertManyArgs).toEqual([]);
  });

  it("writes an audit record only when actually applying", async () => {
    const { db, calls } = createMockDb({});
    (getArchiveDb as jest.Mock).mockResolvedValue(db);
    const backup = { data: emptyBackupData() };

    const dryRun = await computeDiffAndApply(backup, false);
    expect(dryRun.auditId).toBeNull();

    const applied = await computeDiffAndApply(backup, true);
    expect(applied.auditId).toBe("audit-1");
  });
});
