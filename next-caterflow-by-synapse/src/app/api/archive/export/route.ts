import { NextResponse } from "next/server";
import { getArchiveDb, COLLECTIONS } from "@/lib/mongoClient";
import { headers } from "next/headers";

// Simple export/verify skeleton: GET ?runId=archive-... returns run document
export async function GET(request: Request) {
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json(
      { error: "runId query required" },
      { status: 400 },
    );
  }

  try {
    const db = await getArchiveDb();
    const run = await db
      .collection(COLLECTIONS.ARCHIVE_RUNS)
      .findOne({ runId });
    if (!run)
      return NextResponse.json({ error: "run not found" }, { status: 404 });
    // Minimal verification: ensure archived counts exist
    const totalFound = Object.values(run.archived || {}).reduce(
      (a: number, b: number) => a + (b as number),
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
  } catch (err: any) {
    console.error("Archive export error:", err);
    return NextResponse.json(
      { error: err?.message || String(err) },
      { status: 500 },
    );
  }
}
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getArchiveDb, COLLECTIONS } from "@/lib/mongoClient";
import { encryptData } from "@/lib/encryption";

export const maxDuration = 300; // Allow up to 5 minutes for large exports

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    // Ensure only admins can download the backup
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized. Admin access required." },
        { status: 401 },
      );
    }

    const db = await getArchiveDb();
    const exportData: Record<string, any[]> = {};

    // Fetch all data from all archive collections
    for (const collectionName of Object.values(COLLECTIONS)) {
      const data = await db.collection(collectionName).find({}).toArray();
      exportData[collectionName] = data;
    }

    // Add metadata
    const finalExport = {
      metadata: {
        exportedAt: new Date().toISOString(),
        exportedBy: session.user.email,
        collectionsCount: Object.keys(exportData).length,
      },
      data: exportData,
    };

    const jsonString = JSON.stringify(finalExport, null, 2);

    // Encrypt the JSON string
    const encrypted = encryptData(jsonString);
    const payload = JSON.stringify(encrypted);
    return new NextResponse(payload, {
      headers: {
        "Content-Type": "application/json", // encrypted payload as JSON
        "Content-Disposition": `attachment; filename="caterflow_archive_backup_${new Date().toISOString().split("T")[0]}.json.enc"`,
      },
    });
  } catch (error: any) {
    console.error("Archive export failed:", error);
    return NextResponse.json(
      { error: "Failed to generate archive backup", details: error?.message },
      { status: 500 },
    );
  }
}
