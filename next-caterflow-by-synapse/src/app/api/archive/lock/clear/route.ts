import { NextResponse } from "next/server";
import { getArchiveDb, COLLECTIONS } from "@/lib/mongoClient";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(request: Request) {
  // Allow either an authenticated admin session OR the cron/admin secret header
  const session = await getServerSession(authOptions);
  if (!(session?.user && session.user.role === "admin")) {
    const headersList = await headers();
    const adminSecret =
      headersList.get("x-admin-secret") || headersList.get("authorization");
    const expectedCron = `Bearer ${process.env.CRON_SECRET}`;
    const expectedAdmin = `Bearer ${process.env.ADMIN_SECRET}`;

    if (adminSecret !== expectedCron && adminSecret !== expectedAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const db = await getArchiveDb();
    const lockId = "archive-lock";
    // Reset the lock document so future runs can acquire it
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

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Failed to clear archive lock:", err);
    return NextResponse.json(
      { success: false, error: err?.message || String(err) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "Archive lock clear endpoint" });
}
