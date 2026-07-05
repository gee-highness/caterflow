// src/app/api/archive/run/route.ts
// Cron trigger endpoint — called daily at midnight by Vercel Cron
// Also accepts manual POST from admin users

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  runArchive,
  resumeIncompleteArchives,
  cleanupOldArchiveMetadata,
  cleanupArchivedSanityData,
} from "@/lib/archiveService";
import { getArchiveDb, COLLECTIONS } from "@/lib/mongoClient";

export const maxDuration = 300; // 5 minutes — Vercel Pro allows up to 300s

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
      const metadataCleanup = await cleanupOldArchiveMetadata();
      const sanityCleanup = await cleanupArchivedSanityData();
      return NextResponse.json({
        success: true,
        cleanup: true,
        deletedArchiveRuns: metadataCleanup.deletedRuns,
        deletedBaselineSnapshots: metadataCleanup.deletedBaselines,
        deletedSanityDocuments: sanityCleanup.deletedSanityDocuments,
        collectionsProcessed: sanityCleanup.collectionsProcessed,
        cutoff: sanityCleanup.cutoff,
      });
    }

    if (isCronCall) {
      const resumeResult = await resumeIncompleteArchives(5);
      if (resumeResult.attempts > 0) {
        return NextResponse.json({
          success: true,
          resumed: true,
          attempts: resumeResult.attempts,
          finished: resumeResult.finished,
          message: resumeResult.finished
            ? "Resumed incomplete archive run and it has completed."
            : "Resumed incomplete archive run; it will continue on the next available cycle.",
        });
      }
    }

    if (!isCronCall) {
      // For manual admin triggers: validate the archive DB connection and create a queued progress document so the UI sees a run immediately.
      const resumeResult = await resumeIncompleteArchives(5);
      if (resumeResult.attempts > 0) {
        return NextResponse.json({
          success: true,
          resumed: true,
          attempts: resumeResult.attempts,
          finished: resumeResult.finished,
          message: resumeResult.finished
            ? "Resumed incomplete archive run and it has completed."
            : "Resumed incomplete archive run; it will continue on the next available cycle.",
        });
      }
      let dbRef: any = null;
      try {
        dbRef = await getArchiveDb();
        await dbRef.admin().ping();
      } catch (err: any) {
        console.error("Manual archive startup failed:", err);
        return NextResponse.json(
          {
            success: false,
            status: "failed",
            error:
              err?.message ||
              "Unable to connect to archive MongoDB. Check MONGODB_URL / MONGODB_URI and network access.",
            errorMessage:
              err?.message ||
              "Unable to connect to archive MongoDB. Check MONGODB_URL / MONGODB_URI and network access.",
          },
          { status: 500 },
        );
      }

      try {
        const queuedRunId = `archive-queued-${Date.now()}`;
        const progressId = "archive-progress";
        await dbRef.collection(COLLECTIONS.ARCHIVE_RUNS).updateOne(
          { _id: progressId } as any,
          {
            $set: {
              _id: progressId,
              kind: "progress",
              owner: queuedRunId,
              status: "queued",
              startedAt: new Date().toISOString(),
              runId: queuedRunId,
              currentStep: null,
              currentStepIndex: 0,
              totalSteps: 0,
              completedSteps: [],
              pendingSteps: [],
              errors: [],
              progressPercent: 0,
              lastUpdatedAt: new Date().toISOString(),
            },
            $push: { progressMessages: "Archive run queued by admin" },
          } as any,
          { upsert: true },
        );

        const result = await runArchive(queuedRunId);

        const status = result.errors?.length
          ? result.incomplete
            ? "incomplete"
            : "failed"
          : result.incomplete
            ? "incomplete"
            : "success";

        return NextResponse.json(
          {
            success: true,
            started: true,
            status,
            runId: queuedRunId,
            message: result.incomplete
              ? "Archive run is paused due to the execution time limit and will resume on the next scheduled trigger."
              : "Archive run completed successfully.",
            archived: result.archived,
            errors: result.errors,
            durationMs: result.durationMs,
            startedAt: result.startedAt,
            completedAt: result.completedAt,
            incomplete: result.incomplete,
          },
          { status: 200 },
        );
      } catch (err: any) {
        console.error("Manual archive run failed:", err);
        try {
          const progressId = "archive-progress";
          await dbRef.collection(COLLECTIONS.ARCHIVE_RUNS).updateOne(
            { _id: progressId } as any,
            {
              $set: {
                status: "failed",
                completedAt: new Date().toISOString(),
                currentStep: null,
                currentStepIndex: 0,
                pendingSteps: [],
                errors: [err?.message || "Manual archive run failed"],
                progressPercent: 0,
                lastUpdatedAt: new Date().toISOString(),
              },
              $push: {
                progressMessages: `Manual archive run failed: ${err?.message || "unknown error"}`,
              },
            } as any,
          );
        } catch (updateErr: any) {
          console.error(
            "Failed to mark archive progress as failed:",
            updateErr,
          );
        }

        return NextResponse.json(
          {
            success: false,
            status: "failed",
            error: err?.message || "Failed to queue archive run",
            errorMessage: err?.message || "Failed to queue archive run",
          },
          { status: 500 },
        );
      }
    }

    const result = await runArchive();

    const totalArchived = Object.values(result.archived).reduce(
      (a, b) => a + b,
      0,
    );

    // documentsDeleted is approximated as totalArchived (archive implementation stores counts)
    const documentsDeleted = totalArchived;

    return NextResponse.json({
      success: true,
      status: result.errors?.length
        ? "failed"
        : result.incomplete
          ? "incomplete"
          : "success",
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
    return NextResponse.json(
      {
        success: false,
        status: "failed",
        error: error?.message || "Archive run failed",
        errorMessage: error?.message || "Archive run failed",
      },
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
