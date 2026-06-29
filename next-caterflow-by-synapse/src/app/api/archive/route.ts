import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "Archive API root",
    description:
      "This endpoint exists to support archive status and management tooling.",
    endpoints: [
      "/api/archive/status",
      "/api/archive/run",
      "/api/archive/export",
      "/api/archive/validate",
      "/api/archive/verify",
      "/api/archive/safe-delete",
      "/api/archive/health",
      "/api/archive/import",
      "/api/archive/lock/clear",
      "/api/archive/cron/resume",
    ],
  });
}
