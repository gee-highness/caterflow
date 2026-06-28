// src/lib/deleteWithBackupSafety.ts
// Utility for integrating backup safety checks into existing delete operations
// This ensures any delete operation checks for recent backups first

import { enforceBackupBeforeDelete } from "@/lib/backupSafetyChecks";

export interface DeleteWithBackupSafetyOptions {
  documentIds: string[];
  documentType: string;
  reason?: string;
  throwOnBackupFail?: boolean; // If true, throw error if backup check fails
}

export interface DeleteWithBackupSafetyResult {
  allowed: boolean;
  message: string;
  archiveRunId?: string;
  requiresManualBackup?: boolean;
  backupFailed?: boolean;
}

/**
 * Wrap any delete operation with backup safety checks
 *
 * Usage:
 * const safety = await checkDeleteBackupSafety({
 *   documentIds: ["bin-1", "bin-2"],
 *   documentType: "bin",
 *   reason: "user requested"
 * });
 *
 * if (!safety.allowed) {
 *   throw new Error(safety.message);
 * }
 *
 * // Now proceed with delete
 * await deleteFromSanity(documentIds);
 */
export async function checkDeleteBackupSafety(
  options: DeleteWithBackupSafetyOptions,
): Promise<DeleteWithBackupSafetyResult> {
  const {
    documentIds,
    documentType,
    reason = "user-initiated",
    throwOnBackupFail = false,
  } = options;

  console.log(
    `\n🔐 Checking backup safety for ${documentIds.length} ${documentType} deletion(s)`,
  );
  console.log(`   Reason: ${reason}`);

  try {
    // Enforce backup requirement
    const safetyCheck = await enforceBackupBeforeDelete();

    if (safetyCheck.canProceedWithDelete) {
      console.log(`✅ Backup safety check passed. Deletion allowed.`);

      return {
        allowed: true,
        message: safetyCheck.message,
        archiveRunId: safetyCheck.archiveRunId,
      };
    }

    // Backup check failed
    const message = `❌ Deletion blocked: ${safetyCheck.message}`;

    console.error(message);

    if (throwOnBackupFail) {
      const error = new Error(safetyCheck.message);
      (error as any).code = "BACKUP_SAFETY_CHECK_FAILED";
      (error as any).status = 409;
      throw error;
    }

    return {
      allowed: false,
      message: safetyCheck.message,
      requiresManualBackup: !safetyCheck.backupStatus.hasRecentBackup,
      backupFailed: safetyCheck.backupStatus.hasRecentBackup === false,
    };
  } catch (err: any) {
    const message = `❌ Backup safety check error: ${err?.message || "Unknown error"}`;

    console.error(message);

    if (throwOnBackupFail) {
      throw err;
    }

    return {
      allowed: false,
      message,
      requiresManualBackup: true,
      backupFailed: true,
    };
  }
}

/**
 * Higher-order function wrapper for delete operations
 *
 * Usage:
 * const safeDelete = withBackupSafety(async (ids) => {
 *   await writeClient.delete(ids[0]);
 * });
 *
 * // Later, call the safe delete function
 * await safeDelete(["doc-id"], "bin", "cleanup");
 */
export function withBackupSafety<T>(
  deleteOperation: (documentIds: string[]) => Promise<T>,
  documentType: string = "document",
) {
  return async (
    documentIds: string[],
    reason: string = "user-initiated",
  ): Promise<{
    success: boolean;
    result?: T;
    message: string;
    allowedByBackupCheck: boolean;
  }> => {
    // Check backup safety first
    const safety = await checkDeleteBackupSafety({
      documentIds,
      documentType,
      reason,
      throwOnBackupFail: false,
    });

    if (!safety.allowed) {
      return {
        success: false,
        message: safety.message,
        allowedByBackupCheck: false,
      };
    }

    // Proceed with the actual delete operation
    try {
      const result = await deleteOperation(documentIds);
      console.log(
        `✅ Successfully deleted ${documentIds.length} ${documentType}(s)`,
      );
      return {
        success: true,
        result,
        message: `Successfully deleted ${documentIds.length} ${documentType}(s)`,
        allowedByBackupCheck: true,
      };
    } catch (err: any) {
      const message = `❌ Delete operation failed: ${err?.message || "Unknown error"}`;
      console.error(message);
      return {
        success: false,
        message,
        allowedByBackupCheck: true,
      };
    }
  };
}

/**
 * Create a safe delete handler for API routes
 *
 * Usage in route.ts:
 * const safeDeleteHandler = createSafeDeleteHandler(
 *   async (ids) => {
 *     for (const id of ids) {
 *       await writeClient.delete(id);
 *     }
 *   },
 *   "bin"
 * );
 *
 * export async function DELETE(req) {
 *   const { ids } = await req.json();
 *   return safeDeleteHandler(ids, "user cleanup");
 * }
 */
export function createSafeDeleteHandler(
  deleteOperation: (documentIds: string[]) => Promise<void>,
  documentType: string,
) {
  return async (documentIds: string[], reason?: string) => {
    const safety = await checkDeleteBackupSafety({
      documentIds,
      documentType,
      reason: reason || "api-request",
      throwOnBackupFail: true, // Throw error for API routes
    });

    // If we get here, safety check passed
    try {
      await deleteOperation(documentIds);
      return {
        success: true,
        message: `Successfully deleted ${documentIds.length} ${documentType}(s)`,
        deletedCount: documentIds.length,
      };
    } catch (err: any) {
      throw new Error(
        `Delete operation failed: ${err?.message || "Unknown error"}`,
      );
    }
  };
}

/**
 * Response helper for API routes to return consistent error format
 */
export function getDeleteBlockedResponse(
  safetyCheckResult: DeleteWithBackupSafetyResult,
) {
  return {
    success: false,
    error: safetyCheckResult.message,
    code: "DELETE_BLOCKED_BY_BACKUP_SAFETY",
    requiresBackup: safetyCheckResult.requiresManualBackup,
    autoBackupFailed: safetyCheckResult.backupFailed,
  };
}
