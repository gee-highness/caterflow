// src/app/api/archive/status/route.ts
// Returns recent archive run logs for monitoring

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getRecentArchiveRuns } from "@/lib/archiveQueries";
import { getArchiveProgress } from "@/lib/archiveService";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !["admin", "auditor"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const runs = await getRecentArchiveRuns(Math.min(limit, 50));

    const progress = await getArchiveProgress();
    const inProgress = progress.inProgress;
    const serialized = runs.map((run) => {
      const documentsArchived = Object.values(run.archived || {}).reduce(
        (sum: number, value: any) =>
          sum + (typeof value === "number" ? value : 0),
        0,
      );
      const totalInserted =
        typeof run.totalInserted === "number"
          ? run.totalInserted
          : run.steps
            ? run.steps.reduce(
                (s: number, st: any) => s + (st.inserted || 0),
                0,
              )
            : 0;
      const totalSkipped =
        typeof run.totalSkipped === "number"
          ? run.totalSkipped
          : run.steps
            ? run.steps.reduce((s: number, st: any) => s + (st.skipped || 0), 0)
            : 0;
      const status = run.errors?.length
        ? documentsArchived > 0
          ? "partial"
          : "failed"
        : "success";

      return {
        ...run,
        _id: run._id?.toString(),
        runDate: run.startedAt,
        status,
        documentsArchived,
        totalInserted,
        totalSkipped,
        documentsDeleted: run.steps
          ? run.steps.reduce(
              (sum: number, step: any) => sum + (step.deletedCount || 0),
              0,
            )
          : documentsArchived,
        assetsDeleted: run.assetsDeleted || 0,
        steps: run.steps || [],
        errors: run.errors || [],
      };
    });

    return NextResponse.json({
      recentRuns: serialized,
      count: serialized.length,
      archiveInProgress: inProgress,
      currentRun: progress.currentRun,
      staleDetected: progress.staleDetected === true,
    });
  } catch (error: any) {
    console.error("Failed to fetch archive status:", error);
    return NextResponse.json(
      { error: "Failed to fetch archive runs", details: error?.message },
      { status: 500 },
    );
  }
}
