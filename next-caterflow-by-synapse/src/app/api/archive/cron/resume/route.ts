import { NextResponse } from "next/server";
import { resumeIncompleteArchives } from "@/lib/archiveService";
import { headers } from "next/headers";

export async function POST(request: Request) {
  const headersList = await headers();
  const cronSecret =
    headersList.get("x-cron-secret") || headersList.get("authorization");
  const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;
  if (cronSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await resumeIncompleteArchives(5);
    return NextResponse.json({
      success: true,
      attempts: res.attempts,
      finished: res.finished,
    });
  } catch (err: any) {
    console.error("Failed to resume incomplete archives:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "resume failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "Archive resume endpoint" });
}
