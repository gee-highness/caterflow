import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getArchiveDb, COLLECTIONS } from "@/lib/mongoClient";
import { encryptData } from "@/lib/encryption";

export const maxDuration = 300; // Allow up to 5 minutes for large exports

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Unauthorized. Admin access required." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");

  try {
    const db = await getArchiveDb();

    if (runId) {
      const run = await db
        .collection(COLLECTIONS.ARCHIVE_RUNS)
        .findOne({ runId });

      if (!run) {
        return NextResponse.json({ error: "run not found" }, { status: 404 });
      }

      const totalFound = (Object.values(run.archived || {}) as number[]).reduce(
        (a, b) => a + b,
        0,
      );
      const totalDeleted = (run.steps || []).reduce(
        (a: number, s: any) => a + (s.deletedCount || 0),
        0,
      );

      return NextResponse.json({
        runId: run.runId,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        totalFound,
        totalDeleted,
        incomplete: !!run.incomplete,
        raw: run,
      });
    }

    const exportData: Record<string, any[]> = {};
    for (const collectionName of Object.values(COLLECTIONS)) {
      const data = await db.collection(collectionName).find({}).toArray();
      exportData[collectionName] = data;
    }

    const finalExport = {
      metadata: {
        exportedAt: new Date().toISOString(),
        exportedBy: session.user.email,
        collectionsCount: Object.keys(exportData).length,
      },
      data: exportData,
    };

    const jsonString = JSON.stringify(finalExport, null, 2);
    const encrypted = encryptData(jsonString);
    const payload = JSON.stringify(encrypted);

    return new NextResponse(payload, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="caterflow_archive_backup_${new Date().toISOString().split("T")[0]}.json.enc"`,
      },
    });
  } catch (error: any) {
    console.error("❌ Archive export failed:", error?.stack || error);
    return NextResponse.json(
      {
        error: "Failed to generate archive backup",
        details: error?.message || String(error),
        errorName: error?.name,
      },
      { status: 500 },
    );
  }
}
