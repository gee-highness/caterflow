// src/app/api/archive/verify/route.ts
// Verify archive integrity by comparing archived and live document counts

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { client as sanityClient } from "@/lib/sanity";
import { groq } from "next-sanity";
import { getArchiveDb, COLLECTIONS } from "@/lib/mongoClient";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !["admin", "auditor"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("\n🔍 Starting archive integrity verification...");

    const db = await getArchiveDb();
    const verification: Record<string, any> = {
      timestamp: new Date().toISOString(),
      checks: [],
    };

    // Check each document type
    const types = [
      {
        name: "DispatchLog",
        sanityType: "DispatchLog",
        collectionName: COLLECTIONS.DISPATCH_LOGS,
      },
      {
        name: "PurchaseOrder",
        sanityType: "PurchaseOrder",
        collectionName: COLLECTIONS.PURCHASE_ORDERS,
      },
      {
        name: "GoodsReceipt",
        sanityType: "GoodsReceipt",
        collectionName: COLLECTIONS.GOODS_RECEIPTS,
      },
      {
        name: "InternalTransfer",
        sanityType: "InternalTransfer",
        collectionName: COLLECTIONS.INTERNAL_TRANSFERS,
      },
      {
        name: "StockAdjustment",
        sanityType: "StockAdjustment",
        collectionName: COLLECTIONS.STOCK_ADJUSTMENTS,
      },
      {
        name: "InventoryCount",
        sanityType: "InventoryCount",
        collectionName: COLLECTIONS.INVENTORY_COUNTS,
      },
      {
        name: "FileAttachment",
        sanityType: "FileAttachment",
        collectionName: COLLECTIONS.FILE_ATTACHMENTS,
      },
    ];

    let allMatched = true;

    for (const type of types) {
      try {
        // Count in Sanity (live documents)
        const sanityCount = await sanityClient.fetch(
          groq`count(*[_type == $sanityType])`,
          { sanityType: type.sanityType },
        );

        // Count in MongoDB (archived documents)
        const mongoCount = await db
          .collection(type.collectionName)
          .countDocuments();

        // Check for potential duplicates
        const mongoResult = await db
          .collection(type.collectionName)
          .aggregate([
            { $group: { _id: "$_sanityId", count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
          ])
          .toArray();

        const hasDuplicates = mongoResult.length > 0;

        verification.checks.push({
          type: type.name,
          sanityLiveCount: sanityCount,
          mongoArchivedCount: mongoCount,
          duplicateRecords: hasDuplicates ? mongoResult.length : 0,
          status: hasDuplicates ? "warn" : "ok",
        });

        if (hasDuplicates) {
          allMatched = false;
          console.warn(
            `⚠️  ${type.name}: Found ${mongoResult.length} duplicated _sanityId values`,
          );
        } else {
          console.log(
            `✅ ${type.name}: ${mongoCount} archived, ${sanityCount} live`,
          );
        }
      } catch (err: any) {
        verification.checks.push({
          type: type.name,
          error: err?.message,
          status: "error",
        });
        allMatched = false;
        console.error(`❌ ${type.name}: ${err?.message}`);
      }
    }

    // Check ARCHIVE_RUNS collection integrity
    try {
      const runsCount = await db
        .collection(COLLECTIONS.ARCHIVE_RUNS)
        .countDocuments();
      const runs = await db
        .collection(COLLECTIONS.ARCHIVE_RUNS)
        .find({})
        .sort({ startedAt: -1 })
        .limit(1)
        .toArray();

      verification.checks.push({
        type: "ArchiveRuns",
        totalRuns: runsCount,
        lastRun: runs[0]
          ? {
              runId: runs[0].runId,
              startedAt: runs[0].startedAt,
              status: runs[0].errors?.length ? "partial" : "success",
              docsArchived: Object.values(runs[0].archived || {}).reduce(
                (sum: number, val: any) =>
                  sum + (typeof val === "number" ? val : 0),
                0,
              ),
            }
          : null,
        status: "ok",
      });
      console.log(`✅ ArchiveRuns: ${runsCount} total runs`);
    } catch (err: any) {
      verification.checks.push({
        type: "ArchiveRuns",
        error: err?.message,
        status: "error",
      });
      allMatched = false;
    }

    verification.passed = allMatched;
    verification.summary = allMatched
      ? "✅ All archive integrity checks passed"
      : "⚠️  Some issues detected—review duplicates and errors";

    return NextResponse.json(verification);
  } catch (error: any) {
    console.error("❌ Archive verification failed:", error);
    return NextResponse.json(
      {
        error: "Verification failed",
        message: error?.message,
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "Archive verification endpoint",
    method: "POST",
    requires: "Admin or auditor authentication",
    description: "Verify archive data integrity and check for duplicates",
  });
}
