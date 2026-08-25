// src/app/api/archive/safe-delete/route.ts
// Safe deletion endpoint that enforces backup requirements
// This endpoint ensures a recent backup exists before allowing Sanity data deletion
// If no recent backup exists, it automatically triggers an archive

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  enforceBackupBeforeDelete,
  isBackupRecent,
} from "@/lib/backupSafetyChecks";

// POST can call enforceBackupBeforeDelete(), which runs a full synchronous
// archive (runArchive()) when no recent backup exists. Without this, the
// route falls back to Vercel's default function timeout, which is far
// shorter than an archive run can take.
export const maxDuration = 300;

/**
 * GET /api/archive/safe-delete
 * Checks if it's safe to delete (i.e., recent backup exists)
 *
 * Response: { canDelete: boolean, backup: BackupStatus, message: string }
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin or power-user authentication
    const session = await getServerSession(authOptions);
    if (
      !session?.user ||
      !["admin", "power-user"].includes(session.user.role || "")
    ) {
      return NextResponse.json(
        { error: "Unauthorized - admin access required" },
        { status: 401 },
      );
    }

    console.log("\n🔍 User checking backup status before delete...");

    // Check current backup status
    const backupStatus = await isBackupRecent(5);

    return NextResponse.json({
      success: true,
      canDelete: backupStatus.hasRecentBackup,
      backup: backupStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("❌ Error checking delete safety:", error);
    return NextResponse.json(
      {
        error: "Failed to check delete safety status",
        message: error?.message,
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/archive/safe-delete
 * Initiates safe deletion with automatic backup if needed
 *
 * Request body:
 * {
 *   documentIds: string[],     // IDs of documents to delete
 *   documentType?: string,     // Type of documents (e.g., "bin", "user")
 *   reason?: string,           // Reason for deletion
 *   deleteNow?: boolean        // If true, enforce backup check and delete
 * }
 *
 * Response: { success: boolean, backup: BackupStatus, canProceed: boolean, ... }
 */
export async function POST(request: NextRequest) {
  try {
    // Require admin or power-user authentication
    const session = await getServerSession(authOptions);
    if (
      !session?.user ||
      !["admin", "power-user"].includes(session.user.role || "")
    ) {
      return NextResponse.json(
        { error: "Unauthorized - admin access required" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const {
      documentIds = [],
      documentType = "unknown",
      reason = "user-initiated",
      deleteNow = false,
    } = body;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json(
        { error: "documentIds must be a non-empty array" },
        { status: 400 },
      );
    }

    console.log(
      `\n⚠️  User requested deletion of ${documentIds.length} ${documentType} documents`,
    );
    console.log(`   Reason: ${reason}`);
    console.log(`   Enforcing backup safety checks...`);

    // Enforce backup requirement (will auto-trigger archive if needed)
    const safetyCheck = await enforceBackupBeforeDelete();

    if (!safetyCheck.canProceedWithDelete) {
      console.warn(`❌ Deletion blocked: ${safetyCheck.message}`);
      return NextResponse.json(
        {
          success: false,
          canProceed: false,
          backup: safetyCheck.backupStatus,
          message: safetyCheck.message,
          reason: "Backup safety check failed",
          documentIds,
          documentType,
        },
        { status: 409 }, // Conflict - precondition not met
      );
    }

    console.log(`✅ ${safetyCheck.message}`);

    // At this point, a recent backup exists (either was already there or just created)
    // Return success with details, but don't actually delete yet
    // The client should use the dedicated delete APIs with this confirmation

    return NextResponse.json(
      {
        success: true,
        canProceed: true,
        backup: safetyCheck.backupStatus,
        archiveRunId: safetyCheck.archiveRunId,
        message: safetyCheck.message,
        documentIds,
        documentType,
        timestamp: new Date().toISOString(),
        nextStep: deleteNow ? "DELETE_CONFIRMED" : "AWAITING_USER_CONFIRMATION",
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("❌ Safe delete check failed:", error);
    return NextResponse.json(
      {
        error: "Safe delete check failed",
        message: error?.message,
        canProceed: false,
      },
      { status: 500 },
    );
  }
}

/**
 * OPTIONS /api/archive/safe-delete
 * CORS preflight and documentation
 */
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({
    status: "Safe delete endpoint",
    description:
      "Enforces backup requirements before allowing Sanity data deletion",
    methods: {
      GET: "Check if safe to delete (requires recent backup)",
      POST: "Prepare deletion with automatic backup if needed",
    },
    authentication: "Admin or power-user required",
    backupRequirement: "Backup must be less than 5 minutes old",
    autoBackup: "If backup is stale, a new archive is automatically triggered",
  });
}
