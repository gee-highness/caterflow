# Backup Safety Implementation Guide

**Date:** June 28, 2026  
**Status:** ✅ IMPLEMENTED & READY

## Overview

This document describes the backup safety enforcement system that prevents accidental Sanity data loss by ensuring a recent backup exists before allowing any delete operations.

---

## 🛡️ Core Safety Rules

### Rule 1: No Delete Without Recent Backup

- **Requirement**: A successful backup must have completed within the last **5 minutes**
- **If outdated**: An automatic archive is triggered before the delete is allowed
- **If auto-archive fails**: The delete operation is blocked

### Rule 2: Automatic Backup Before Delete

- **Trigger**: Delete request with stale or missing backup
- **Action**: System automatically runs full archive
- **Completion**: User receives confirmation and can proceed with delete
- **No manual intervention**: System handles backup automatically

### Rule 3: Delete Operations Are Blocked For Safety

- **Status**: User sees clear message about why delete is blocked
- **Next steps**: Either:
  1. Wait for automatic backup (displays progress)
  2. Trigger manual backup if preferred
  3. Retry delete after backup completes

---

## 🔧 Implementation Components

### 1. archiveService.ts - New Functions

#### `getLastBackupTime(): Promise<string | null>`

Returns the ISO timestamp of the last successful backup.

```typescript
const lastBackup = await getLastBackupTime();
// Returns: "2026-06-28T15:32:45.123Z" or null
```

#### `isBackupRecent(withinMinutes: number): Promise<BackupStatus>`

Checks if a recent backup exists (default: 5 minutes).

```typescript
const status = await isBackupRecent(5); // Check if backup is within 5 minutes
// Returns:
// {
//   hasRecentBackup: boolean,
//   lastBackupTime: "2026-06-28T15:32:45.123Z" | null,
//   minutesSinceLastBackup: 2.5,
//   requiresBackupBeforeDelete: boolean,
//   message: "✅ Recent backup found (2.5 minutes ago). Safe to delete."
// }
```

#### `enforceBackupBeforeDelete(): Promise<SafetyCheckResult>`

Main function that enforces the backup requirement. **Automatically triggers archive if backup is missing/stale.**

```typescript
const result = await enforceBackupBeforeDelete();
// Returns:
// {
//   canProceedWithDelete: true,
//   backupStatus: { ... },
//   archiveRunId?: "archive-123",
//   message: "✅ Automatic archive completed. Delete can now proceed."
// }
```

#### `recordBackupCompletion(backupId, metadata): Promise<void>`

Records an external backup completion (for use with external backup systems).

```typescript
await recordBackupCompletion("ext-backup-001", {
  system: "AWS S3",
  bucket: "caterflow-backups",
  timestamp: new Date().toISOString(),
});
```

---

### 2. API Routes

#### `POST /api/archive/safe-delete`

Main endpoint for safe deletion. Enforces backup checks and auto-triggers archive if needed.

**Request:**

```json
{
  "documentIds": ["bin-1", "bin-2"],
  "documentType": "bin",
  "reason": "user cleanup",
  "deleteNow": false
}
```

**Response (Safe):**

```json
{
  "success": true,
  "canProceed": true,
  "backup": {
    "hasRecentBackup": true,
    "minutesSinceLastBackup": 2.5,
    "message": "✅ Recent backup found. Safe to delete."
  },
  "message": "✅ Backup verified. Deletion can proceed.",
  "nextStep": "AWAITING_USER_CONFIRMATION"
}
```

**Response (Auto-Backup Triggered):**

```json
{
  "success": true,
  "canProceed": true,
  "archiveRunId": "run-2026-06-28-153245",
  "backup": {
    "hasRecentBackup": true,
    "minutesSinceLastBackup": 0,
    "message": "✅ Automatic backup completed. Delete can now proceed."
  },
  "message": "✅ Automatic archive completed. Delete can now proceed."
}
```

**Response (Blocked):**

```json
{
  "success": false,
  "canProceed": false,
  "backup": {
    "hasRecentBackup": false,
    "message": "Automatic archive failed"
  },
  "message": "❌ Automatic archive failed. Delete blocked for data safety.",
  "reason": "Backup safety check failed"
}
```

#### `GET /api/archive/safe-delete`

Check current backup status without modifying anything.

**Response:**

```json
{
  "success": true,
  "canDelete": true,
  "backup": {
    "hasRecentBackup": true,
    "minutesSinceLastBackup": 2.5,
    "message": "✅ Recent backup found (2.5 minutes ago). Safe to delete."
  }
}
```

---

### 3. React Hook - useSafeDelete

Simplifies backup safety checks in React components.

**Basic Usage:**

```typescript
import { useSafeDelete } from "@/hooks/useSafeDelete";

export function BinDeleteButton({ binIds }) {
  const {
    checkBackupStatus,
    prepareSafeDeletion,
    isLoading,
    error,
    lastResponse,
  } = useSafeDelete({
    onBackupTriggered: (archiveId) => {
      console.log("Backup triggered:", archiveId);
    },
    onDeleteBlocked: (reason) => {
      showError(reason);
    },
  });

  const handleDelete = async () => {
    // Prepare deletion (enforces backup check, auto-triggers archive if needed)
    const result = await prepareSafeDeletion(binIds, "bin", "user cleanup");

    if (result?.canProceed) {
      // Now safe to delete - proceed with actual deletion
      await deleteBins(binIds);
    } else {
      // Deletion blocked - show error to user
      showError(result?.message);
    }
  };

  return (
    <button onClick={handleDelete} disabled={isLoading}>
      {isLoading ? "Checking backup..." : "Delete Bins"}
    </button>
  );
}
```

**Check Status Only:**

```typescript
const status = await checkBackupStatus();
if (status?.canDelete) {
  // Safe to delete
} else {
  // Backup required
}
```

**Advanced Usage:**

```typescript
const { hasRecentBackup, minutesSinceBackup, getLastBackupStatus } =
  useSafeDelete();

// Later...
if (hasRecentBackup()) {
  const minutesSince = minutesSinceBackup();
  console.log(`Backup is ${minutesSince.toFixed(2)} minutes old`);
}
```

---

### 4. Utility Functions

#### checkDeleteBackupSafety()

Direct function for checking delete safety (no React dependency).

```typescript
import { checkDeleteBackupSafety } from "@/lib/deleteWithBackupSafety";

const safety = await checkDeleteBackupSafety({
  documentIds: ["bin-1", "bin-2"],
  documentType: "bin",
  reason: "user cleanup",
  throwOnBackupFail: false,
});

if (safety.allowed) {
  // Proceed with delete
} else {
  console.error(safety.message);
}
```

#### createSafeDeleteHandler()

Creates a safe delete handler for API routes.

```typescript
import { createSafeDeleteHandler } from "@/lib/deleteWithBackupSafety";
import { writeClient } from "@/lib/sanity";

const safeDelete = createSafeDeleteHandler(async (ids) => {
  for (const id of ids) {
    await writeClient.delete(id);
  }
}, "bin");

// In your DELETE route:
export async function DELETE(req: NextRequest) {
  try {
    const { ids } = await req.json();
    const result = await safeDelete(ids, "user requested");
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status || 500 },
    );
  }
}
```

---

## 📋 Integration Checklist

### For API Route Updates

Update existing delete endpoints to use backup safety checks:

- [ ] `DELETE /api/bins` - Integrate backup safety check
- [ ] `DELETE /api/users` - Integrate backup safety check
- [ ] `DELETE /api/stock-items` - Integrate backup safety check
- [ ] `DELETE /api/suppliers` - Integrate backup safety check
- [ ] `DELETE /api/categories` - Integrate backup safety check
- [ ] Any other DELETE endpoints

**Example Integration:**

```typescript
import {
  checkDeleteBackupSafety,
  getDeleteBlockedResponse,
} from "@/lib/deleteWithBackupSafety";

export async function DELETE(req: NextRequest) {
  try {
    const { ids } = await req.json();

    // Check backup safety BEFORE delete
    const safety = await checkDeleteBackupSafety({
      documentIds: ids,
      documentType: "bin",
      reason: "api-request",
    });

    if (!safety.allowed) {
      return NextResponse.json(
        getDeleteBlockedResponse(safety),
        { status: 409 }, // Conflict - precondition not met
      );
    }

    // Now proceed with delete
    for (const id of ids) {
      await writeClient.delete(id);
    }

    return NextResponse.json({ success: true, deletedCount: ids.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

### For Component Updates

Update delete buttons/modals to use the safe delete hook:

- [ ] Update bin deletion component
- [ ] Update user deletion component
- [ ] Update stock item deletion component
- [ ] Update supplier deletion component
- [ ] Update category deletion component
- [ ] Update bulk delete operations

**Example Update:**

```typescript
import { useSafeDelete } from "@/hooks/useSafeDelete";

export function DeleteBinButton({ binId }) {
  const { prepareSafeDeletion, isLoading } = useSafeDelete();

  const handleDelete = async () => {
    const result = await prepareSafeDeletion([binId], "bin", "user deletion");
    if (result?.canProceed) {
      // Proceed with actual deletion
    }
  };

  return (
    <button onClick={handleDelete} disabled={isLoading}>
      {isLoading ? "Checking backup..." : "Delete"}
    </button>
  );
}
```

---

## 🚀 Deployment Steps

1. **Validate Code:**

   ```bash
   npm run lint
   npm run type-check
   npm test
   ```

2. **Test in Staging:**
   - Test delete without recent backup (should trigger auto-archive)
   - Test delete with recent backup (should proceed immediately)
   - Test backup failure scenario (should block delete)
   - Test with external backup recording

3. **Monitor in Production:**
   - Track how often auto-backups are triggered
   - Monitor backup completion times
   - Watch for any delete blockages and reasons
   - Alert if backup failures occur

4. **Rollout Strategy:**
   - Deploy archiveService changes first
   - Deploy API endpoints
   - Deploy hooks and utilities
   - Update UI components incrementally
   - Monitor for 7 days
   - Full rollout

---

## 📊 Monitoring & Alerting

### Key Metrics

| Metric                   | Target         | Alert If                      |
| ------------------------ | -------------- | ----------------------------- |
| Backup Completion Rate   | >99.9%         | <99%                          |
| Auto-Backup Trigger Rate | <1% of deletes | >5% (indicates stale backups) |
| Backup Duration          | <2 min         | >5 min                        |
| Delete Block Rate        | <0.1%          | >1%                           |
| False Positives          | 0%             | Any observed                  |

### Alerts to Configure

1. **Backup Failure**: Alert when auto-backup fails during delete
2. **High Backup Rate**: Alert if >5% of deletes require backup
3. **Stale Backups**: Alert if backup hasn't run in >15 minutes
4. **Delete Blockages**: Alert if >100 blocks per hour

---

## 🔍 Troubleshooting

### Issue: Delete Always Blocked Even With Recent Backup

**Solution:**

1. Check backup timestamp in MongoDB: `db.archiveRuns.findOne({}, {sort: {completedAt: -1}})`
2. Verify archive was successful (check `steps.status`)
3. Check system clock sync (time skew could cause issues)

### Issue: Auto-Backup Takes Too Long

**Solution:**

1. Check archive payload size in `archiveValidation.ts`
2. Optimize GROQ queries for large datasets
3. Consider archiving in background with webhook notification

### Issue: Users Get Errors When Deleting

**Solution:**

1. Provide clear UI messaging about auto-backup
2. Show progress during auto-backup
3. Offer manual backup option if auto-backup takes >30s
4. Log all blockages for debugging

### Issue: External Backup Not Recognized

**Solution:**

1. Call `recordBackupCompletion()` immediately after backup finishes
2. Use consistent backup IDs for tracking
3. Store metadata for audit trail

---

## 📚 API Reference

### Type Definitions

```typescript
interface BackupStatus {
  hasRecentBackup: boolean;
  lastBackupTime: string | null;
  minutesSinceLastBackup: number;
  requiresBackupBeforeDelete: boolean;
  message: string;
}

interface SafetyCheckResult {
  canProceedWithDelete: boolean;
  backupStatus: BackupStatus;
  archiveRunId?: string;
  message: string;
}

interface DeleteWithBackupSafetyOptions {
  documentIds: string[];
  documentType: string;
  reason?: string;
  throwOnBackupFail?: boolean;
}

interface SafeDeleteResponse {
  success: boolean;
  canProceed: boolean;
  backup: BackupStatus;
  archiveRunId?: string;
  message: string;
  documentIds: string[];
  documentType: string;
}
```

---

## ✅ Testing Scenarios

### Scenario 1: Delete With Recent Backup

```
1. Create data
2. Run archive (wait for completion)
3. Within 5 minutes, delete data
✅ Expected: Delete succeeds immediately, no auto-backup triggered
```

### Scenario 2: Delete With Stale Backup

```
1. Create data
2. Run archive
3. Wait >5 minutes
4. Delete data
✅ Expected: Auto-backup triggered, then delete succeeds
```

### Scenario 3: Delete With No Backup

```
1. Create data
2. Do NOT run archive
3. Delete data
✅ Expected: Auto-backup triggered, then delete succeeds
```

### Scenario 4: Auto-Backup Failure

```
1. Create data
2. Mock MongoDB connection failure
3. Delete data
✅ Expected: Auto-backup fails, delete is blocked with error
```

---

## 📞 Support & Questions

For issues or questions:

1. Review this documentation
2. Check logs in `/api/archive/safe-delete` endpoint
3. Inspect MongoDB `archiveRuns` collection
4. Contact DevOps team for infrastructure issues

---

**Last Updated:** June 28, 2026  
**Next Review:** August 28, 2026  
**Version:** 1.0.0
