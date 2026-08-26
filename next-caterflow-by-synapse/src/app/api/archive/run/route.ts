// src/app/api/archive/run/route.ts
// Cron trigger endpoint — called daily at midnight by Vercel Cron
// Also accepts manual POST from admin users

import { NextResponse, after } from "next/server";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  runArchive,
  resumeIncompleteArchives,
  cleanupOldArchiveMetadata,
  cleanupArchivedSanityData,
  ARCHIVE_PROGRESS_STALE_MS,
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
      const cleanupErrors = sanityCleanup.errors || [];
      if (cleanupErrors.length) {
        console.error(
          `❌ Sanity cleanup completed with ${cleanupErrors.length} error(s):`,
          cleanupErrors,
        );
      }
      return NextResponse.json({
        // Previously always `true`, even when sanityCleanup.errors had
        // entries — an admin could see "success" while some documents
        // silently failed to delete. Now reflects whether anything
        // actually went wrong.
        success: cleanupErrors.length === 0,
        cleanup: true,
        deletedArchiveRuns: metadataCleanup.deletedRuns,
        deletedBaselineSnapshots: metadataCleanup.deletedBaselines,
        deletedSanityDocuments: sanityCleanup.deletedSanityDocuments,
        collectionsProcessed: sanityCleanup.collectionsProcessed,
        cutoff: sanityCleanup.cutoff,
        errors: cleanupErrors,
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
        // Retry a momentary connection blip instead of failing the whole
        // request immediately — this is exactly the check that produced
        // "MongoServerSelectionError: Server selection timed out after
        // 30000 ms" -> 500 in production even when the cluster recovered
        // seconds later.
        let pingErr: any;
        let pinged = false;
        for (let attempt = 1; attempt <= 3 && !pinged; attempt++) {
          try {
            await dbRef.admin().ping();
            pinged = true;
          } catch (err: any) {
            pingErr = err;
            if (attempt < 3) {
              await new Promise((resolve) =>
                setTimeout(resolve, 500 * Math.pow(2, attempt - 1)),
              );
            }
          }
        }
        if (!pinged) throw pingErr;
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

        // ── Concurrency guard ──────────────────────────────────────────
        // Nothing previously checked whether a run was already active
        // before overwriting this same document with a brand-new runId.
        // A double-click, two admin tabs open at once, or an impatient
        // retry (very plausible given the original "click and nothing
        // happens" symptom) could start two concurrent runArchive() calls
        // racing on the same progress doc — corrupting the displayed
        // progress and doubling the Sanity/Mongo load for no benefit.
        // Only block on a run that's genuinely still active: a run whose
        // progress hasn't been updated in ARCHIVE_PROGRESS_STALE_MS is
        // presumed dead (matches the staleness logic runArchive() itself
        // uses) and is safe to supersede.
        const existingProgress = await dbRef
          .collection(COLLECTIONS.ARCHIVE_RUNS)
          .findOne({ _id: progressId } as any);
        if (
          existingProgress &&
          ["queued", "running", "incomplete"].includes(
            existingProgress.status,
          )
        ) {
          const lastUpdatedTs = existingProgress.lastUpdatedAt
            ? new Date(existingProgress.lastUpdatedAt).getTime()
            : null;
          const isStale =
            !lastUpdatedTs ||
            Date.now() - lastUpdatedTs > ARCHIVE_PROGRESS_STALE_MS;
          if (!isStale) {
            console.warn(
              `⚠️ Rejected new archive run — one is already ${existingProgress.status} (runId: ${existingProgress.runId}, last updated ${existingProgress.lastUpdatedAt}).`,
            );
            return NextResponse.json(
              {
                success: false,
                status: "failed",
                archiveInProgress: true,
                error: `An archive run is already ${existingProgress.status} (started ${existingProgress.startedAt}). Please wait for it to finish.`,
                errorMessage: `An archive run is already ${existingProgress.status} (started ${existingProgress.startedAt}). Please wait for it to finish.`,
                currentRunId: existingProgress.runId,
              },
              { status: 409 },
            );
          }
          console.warn(
            `⚠️ Superseding a stale archive run (runId: ${existingProgress.runId}, status: ${existingProgress.status}, last updated ${existingProgress.lastUpdatedAt}) — starting a new one.`,
          );
        }

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

        // Start the archive run in the background so the HTTP request does not timeout.
        // IMPORTANT: a bare `void runArchive(...)` is not safe here — on Vercel the
        // serverless function can be frozen/terminated as soon as the response below
        // is sent, which kills this promise before it does any real work. `after()`
        // tells the platform to keep the function alive until this callback settles.
        after(() =>
          runArchive(queuedRunId).catch((backgroundError: any) => {
            console.error("Background archive run failed:", backgroundError);
          }),
        );

        return NextResponse.json(
          {
            success: true,
            started: true,
            status: "started",
            runId: queuedRunId,
            message:
              "Archive run queued successfully and will continue in the background.",
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
      warnings: result.warnings,
      totalInserted: result.totalInserted,
      totalUpdated: result.totalUpdated,
      totalSkipped: result.totalSkipped,
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
