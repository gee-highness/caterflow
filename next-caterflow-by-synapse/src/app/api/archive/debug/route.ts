import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getArchiveDb, COLLECTIONS } from "@/lib/mongoClient";
import { getRecentArchiveRuns } from "@/lib/archiveQueries";
import { getArchiveProgress } from "@/lib/archiveService";

const STALE_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !["admin", "auditor"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getArchiveDb();
    const progressId = "archive-progress";
    const progressDoc = await db
      .collection(COLLECTIONS.ARCHIVE_RUNS)
      .findOne({ _id: progressId } as any);
    const progress = await getArchiveProgress();
    const recentRuns = await getRecentArchiveRuns(10);

    const lastUpdatedAt =
      progressDoc?.lastUpdatedAt || progressDoc?.startedAt || null;
    const lastUpdatedTs = lastUpdatedAt
      ? new Date(lastUpdatedAt).getTime()
      : null;
    const now = Date.now();
    const isStale = lastUpdatedTs ? now - lastUpdatedTs > STALE_MS : false;
    const activeStatus = progressDoc?.status;
    const isActiveStatus = ["queued", "running", "incomplete"].includes(
      activeStatus,
    );
    const staleActiveState = isActiveStatus && isStale;

    return NextResponse.json({
      success: true,
      archiveInProgress: progress.inProgress,
      currentRun: progress.currentRun,
      progressDoc,
      recentRuns: recentRuns.map((run) => ({
        ...run,
        _id: run._id?.toString(),
      })),
      diagnostics: {
        lastUpdatedAt,
        staleThresholdMs: STALE_MS,
        isStale,
        isActiveStatus,
        staleActiveState,
        now: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Failed to fetch archive diagnostics:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch archive diagnostics",
        details: error?.message,
      },
      { status: 500 },
    );
  }
}
