// src/lib/backupSafetyChecks.ts
// Backup safety enforcement utilities for delete operations
// Ensures recent backups exist before allowing Sanity data deletion

import { getArchiveDb, COLLECTIONS } from "@/lib/mongoClient";
import { runArchive } from "@/lib/archiveService";

export interface BackupStatus {
  hasRecentBackup: boolean;
  lastBackupTime: string | null;
  minutesSinceLastBackup: number;
  requiresBackupBeforeDelete: boolean;
  message: string;
}

/**
 * Get the timestamp of the last successful backup/archive run
 */
export async function getLastBackupTime(): Promise<string | null> {
  try {
    const db = await getArchiveDb();
    const lastRun = await db.collection(COLLECTIONS.ARCHIVE_RUNS).findOne(
      {
        // Real archive/backup runs have no `kind` field. "cleanup" runs only
        // delete already-archived Sanity docs (they copy nothing new to
        // Mongo) and "progress"/"cleanup-progress" are status singletons —
        // neither should count as a "backup" for safety-gate purposes.
        kind: { $exists: false },
        $or: [
          { "steps.status": { $in: ["success", "partial"] } },
          { errors: { $size: 0 } },
        ],
      },
      { sort: { completedAt: -1 } },
    );
    return lastRun?.completedAt || null;
  } catch (err) {
    console.error("❌ Failed to get last backup time:", err);
    return null;
  }
}

/**
 * Check if a recent backup exists (within the specified minutes)
 * Default: 5 minutes
 */
export async function isBackupRecent(
  withinMinutes: number = 5,
): Promise<BackupStatus> {
  try {
    const lastBackupTime = await getLastBackupTime();

    if (!lastBackupTime) {
      return {
        hasRecentBackup: false,
        lastBackupTime: null,
        minutesSinceLastBackup: Infinity,
        requiresBackupBeforeDelete: true,
        message:
          "❌ No backup found. Backup is required before any delete operation.",
      };
    }

    const lastBackupDate = new Date(lastBackupTime);
    const now = new Date();
    const millisecondsSinceBackup = now.getTime() - lastBackupDate.getTime();
    const minutesSinceBackup = millisecondsSinceBackup / (1000 * 60);

    const isRecent = minutesSinceBackup <= withinMinutes;

    if (isRecent) {
      return {
        hasRecentBackup: true,
        lastBackupTime,
        minutesSinceLastBackup: minutesSinceBackup,
        requiresBackupBeforeDelete: false,
        message: `✅ Recent backup found (${minutesSinceBackup.toFixed(2)} minutes ago). Safe to delete.`,
      };
    } else {
      return {
        hasRecentBackup: false,
        lastBackupTime,
        minutesSinceLastBackup: minutesSinceBackup,
        requiresBackupBeforeDelete: true,
        message: `⚠️  Backup is stale (${minutesSinceBackup.toFixed(2)} minutes ago). A new backup is required before delete.`,
      };
    }
  } catch (err) {
    console.error("❌ Error checking backup recency:", err);
    return {
      hasRecentBackup: false,
      lastBackupTime: null,
      minutesSinceLastBackup: Infinity,
      requiresBackupBeforeDelete: true,
      message:
        "❌ Error checking backup status. Delete operation blocked for safety.",
    };
  }
}

/**
 * Enforce backup requirement before deletion
 * If no recent backup exists, automatically triggers an archive
 * Returns the backup status after checking/triggering archive
 */
export async function enforceBackupBeforeDelete(): Promise<{
  canProceedWithDelete: boolean;
  backupStatus: BackupStatus;
  archiveRunId?: string;
  message: string;
}> {
  try {
    // console.log("\n🔐 Enforcing backup safety check before delete...");

    // Check if backup is recent
    const backupStatus = await isBackupRecent(5);

    if (backupStatus.hasRecentBackup) {
      // console.log(`✅ Recent backup exists. Delete can proceed safely.`);
      return {
        canProceedWithDelete: true,
        backupStatus,
        message: backupStatus.message,
      };
    }

    // Backup is missing/stale - trigger automatic archive
    // console.log(
    //   "⚠️  No recent backup found. Automatically triggering archive before delete...",
    // );

    const archiveResult = await runArchive();

    // Determine success by checking for errors and archived counts
    const archivedCount = Object.values(archiveResult.archived || {}).reduce(
      (a, b) => a + (typeof b === "number" ? b : 0),
      0,
    );

    const archiveSucceeded = (archiveResult.errors || []).length === 0;

    if (archiveSucceeded && archivedCount >= 0) {
      // console.log(
      //   `✅ Archive completed (runId: ${archiveResult.runId}). Delete can now proceed.`,
      // );
      return {
        canProceedWithDelete: true,
        backupStatus: {
          hasRecentBackup: true,
          lastBackupTime: archiveResult.completedAt,
          minutesSinceLastBackup: 0,
          requiresBackupBeforeDelete: false,
          message: `✅ Automatic backup completed. Delete can now proceed.`,
        },
        archiveRunId: archiveResult.runId,
        message: `✅ Automatic archive completed (${archivedCount} documents backed up). Delete can now proceed.`,
      };
    } else {
      console.error(
        `❌ Archive failed or had errors. Delete operation blocked for safety.`,
      );
      return {
        canProceedWithDelete: false,
        backupStatus,
        archiveRunId: archiveResult.runId,
        message: `❌ Automatic archive failed or had errors: ${(archiveResult.errors || []).join(", ")}. Delete blocked for data safety.`,
      };
    }
  } catch (err: any) {
    console.error("❌ Error during backup enforcement:", err);
    return {
      canProceedWithDelete: false,
      backupStatus: {
        hasRecentBackup: false,
        lastBackupTime: null,
        minutesSinceLastBackup: Infinity,
        requiresBackupBeforeDelete: true,
        message: "❌ Critical error checking backup status.",
      },
      message: `❌ Critical error: ${err?.message}. Delete blocked for safety.`,
    };
  }
}

/**
 * Record a manual backup completion (useful for external backup systems)
 */
export async function recordBackupCompletion(
  backupId: string,
  metadata?: Record<string, any>,
): Promise<void> {
  try {
    const db = await getArchiveDb();
    await db.collection(COLLECTIONS.ARCHIVE_RUNS).insertOne({
      runId: backupId,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
      archived: {},
      steps: [
        {
          name: "ExternalBackup",
          count: 0,
          deletedCount: 0,
          status: "success" as const,
          errors: [],
          warnings: [],
          message: "External backup recorded",
        },
      ],
      errors: [],
      skipped: 0,
      assetsDeleted: 0,
      _isExternal: true,
      _backupMetadata: metadata,
    });
    // console.log(`✅ Backup completion recorded: ${backupId}`);
  } catch (err) {
    console.error("❌ Failed to record backup completion:", err);
    throw err;
  }
}
