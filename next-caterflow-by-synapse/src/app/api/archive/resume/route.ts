import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resumeIncompleteArchives } from "@/lib/archiveService";

export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await resumeIncompleteArchives(5);
    return NextResponse.json({
      success: true,
      attempts: res.attempts,
      finished: res.finished,
    });
  } catch (error: any) {
    console.error("Failed to resume incomplete archives:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to resume incomplete archive run",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "Archive resume endpoint" });
}
