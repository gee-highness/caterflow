// src/app/api/archive/run/route.ts
// Cron trigger endpoint — called daily at midnight by Vercel Cron
// Also accepts manual POST from admin users

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getArchiveDb, COLLECTIONS } from "@/lib/mongoClient";
import { runArchive, cleanupOldArchiveMetadata } from "@/lib/archiveService";

export const maxDuration = 300; // 5 minutes — Vercel Pro allows up to 300s

async function clearStaleArchiveLock(): Promise<boolean> {
  const db = await getArchiveDb();
  const lockId = "archive-lock";
  const lockTimeoutMs = parseInt(
    process.env.ARCHIVE_LOCK_TIMEOUT_MS || "600000",
    10,
  );
  const lockCutoff = new Date(Date.now() - lockTimeoutMs);

  const lockDoc = await db
    .collection(COLLECTIONS.ARCHIVE_RUNS)
    .findOne({ _id: lockId } as any);

  if (!lockDoc || !lockDoc.locked || !lockDoc.acquiredAt) {
    return false;
  }

  const acquiredAt = new Date(lockDoc.acquiredAt);
  if (Number.isNaN(acquiredAt.getTime()) || acquiredAt >= lockCutoff) {
    return false;
  }

  await db.collection(COLLECTIONS.ARCHIVE_RUNS).updateOne(
    { _id: lockId } as any,
    {
      $set: {
        locked: false,
        owner: null,
        releasedAt: new Date().toISOString(),
      },
    },
    { upsert: true },
  );

  return true;
}

export async function POST(request: Request) {
  // ── Authentication: Accept either Vercel Cron secret OR admin session ──

  const headersList = await headers();
  const cronSecret =
    headersList.get("x-cron-secret") || headersList.get("authorization");
  const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

  const isCronCall = cronSecret === expectedSecret;

  if (!isCronCall) {
    // Check for authenticated admin session (manual trigger)
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const deleteOld = searchParams.get("deleteOld") === "true";

  console.log(
    `\n🚀 Archive run triggered by: ${isCronCall ? "Vercel Cron" : "Admin user"}${deleteOld ? " (cleanup mode)" : ""}`,
  );

  try {
    if (deleteOld) {
      const cleanupResult = await cleanupOldArchiveMetadata();
      return NextResponse.json({
        success: true,
        cleanup: true,
        deletedArchiveRuns: cleanupResult.deletedRuns,
        deletedBaselineSnapshots: cleanupResult.deletedBaselines,
        cutoff: cleanupResult.cutoff,
      });
    }

    const lockCleared = await clearStaleArchiveLock();
    const result = await runArchive();

    const totalArchived = Object.values(result.archived).reduce(
      (a, b) => a + b,
      0,
    );

    // documentsDeleted is approximated as totalArchived (archive implementation stores counts)
    const documentsDeleted = totalArchived;

    return NextResponse.json({
      success: true,
      lockCleared,
      runId: result.runId,
      totalArchived,
      documentsDeleted,
      breakdown: result.archived,
      // Steps and assetsDeleted are optional in current implementation
      errors: result.errors,
      durationMs: result.durationMs,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
    });
  } catch (error: any) {
    console.error("❌ Archive run failed:", error);
    if (error?.message === "Archive run already in progress") {
      return NextResponse.json(
        { success: false, error: error.message, archiveInProgress: true },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { success: false, error: error?.message || "Archive run failed" },
      { status: 500 },
    );
  }
}

// Allow GET for quick health check
export async function GET() {
  return NextResponse.json({
    status: "Archive endpoint ready",
    schedule: "Daily at midnight (UTC)",
    threshold: `${process.env.ARCHIVE_DAYS_THRESHOLD || 90} days`,
  });
}
