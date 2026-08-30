# Archive & cleanup: batching, checkpointing, and safe resumption

## The core problem
Every archive step (`DispatchLogs`, `PurchaseOrders`, `GoodsReceipts`,
`InternalTransfers`, `StockAdjustments`, `InventoryCounts`,
`FileAttachments`, `StockSnapshots`) fetched its *entire* matching backlog
from Sanity in one shot and wrote it in one shot. The only checkpointing was
*between* whole steps — if a single step's own work took longer than the
remaining time budget, the whole function just got hard-killed by Vercel's
300s timeout with nothing persisted: no history record, no partial
progress. That's what produced "504 after 300s, and the run never showed up
in history."

The Sanity cleanup path (`deleteOld=true`) had the same exposure, just
un-triggered so far — it ran fully synchronously in the request handler
with zero batching, zero checkpointing, and wasn't even backgrounded with
`after()`.

## What changed

**`src/lib/archiveService.ts`**
- New `archiveTypeBatched()` engine: every archive step now fetches and
  writes in batches of 200 (`ARCHIVE_BATCH_SIZE`), using cursor-based
  (`_id > $lastId`) pagination — not a numeric offset, which can silently
  skip/duplicate rows if new eligible documents appear between runs.
- Time budget is checked **before every batch**, not just between whole
  steps, and adapts to how long batches are actually taking (requires
  1.5x the last batch's duration, or a fixed 8s floor before the first
  batch has run).
- If time runs low mid-step, the step stops cleanly and persists exactly
  where it got to (a Sanity `_id` cursor). The run is written to history
  as `incomplete: true` — never silently dropped.
- The next invocation (cron's existing resume logic, or a manual re-run)
  picks up each step exactly where it left off, instead of re-scanning the
  whole backlog.
- New `archiveTypeBatched`-equivalent for cleanup: `cleanupCollectionBatched()`
  + a rewritten `cleanupArchivedSanityData()` that batches and checkpoints
  per collection, the same way.
- **Fixed a real growth bug in cleanup**: the old query for "documents due
  for Sanity deletion" never excluded documents already cleaned up in a
  previous pass. Every cleanup run re-scanned and re-attempted deletion of
  *every* document ever cleaned, not just new ones — the candidate set only
  ever grew, making each run slower over time. Now excludes
  `_sanityDeletedAt: { $exists: false }`.
- New `getCleanupProgress()` / `resumeIncompleteCleanup()`, mirroring the
  existing archive-progress functions, so cleanup runs are visible and
  auto-resumable the same way archive runs are.
- **Fixed a latent bug in the existing `resumeIncompleteArchives()`**: its
  retry loop (`maxAttempts = 5`) had no outer time budget, so if a backlog
  needed more than one resume cycle, it could call `runArchive()` up to 5
  times in a row in a single invocation — each allowed to run ~270s — for
  up to ~22 minutes against Vercel's 300-second hard limit. That would
  silently reproduce the exact same "killed mid-flight" failure one level
  up. Added an outer time-budget guard so it stops cleanly after however
  many attempts fit in the remaining time, and lets the next cron tick
  continue. Applied the same guard to the new `resumeIncompleteCleanup()`.

**`src/app/api/archive/run/route.ts`**
- `deleteOld=true` (cleanup) now runs in the background via `after()`,
  the same pattern already used for manual archive triggers, with its own
  `cleanup-progress` singleton doc and concurrency guard (only an actively
  `running` cleanup blocks a new one — an `incomplete` one is resumed
  instead of blocked, matching how archive runs already behave).
- Cron now also calls `resumeIncompleteCleanup(5)` alongside the existing
  `resumeIncompleteArchives(5)`, so an interrupted cleanup doesn't sit
  stuck until an admin happens to manually re-trigger it.

**`src/app/admin/archive/page.tsx`**
- Updated the cleanup-trigger handling to match: since cleanup no longer
  returns `deletedSanityDocuments`/`errors` synchronously (that work now
  happens in the background), the toast now says "Cleanup Started" instead
  of claiming a result that hasn't happened yet.
- The "already in progress" error message now distinguishes an archive
  conflict from a cleanup conflict.

## What's still worth doing (not done here)
- There's no `/api/archive/status`-equivalent route in this bundle to poll
  `getCleanupProgress()` from the UI the way the archive run's progress is
  presumably already polled — I added the function, but wiring a live
  progress view for cleanup into the admin page would need that route,
  which wasn't part of this file set.
- Consider raising `maxDuration` (and `ARCHIVE_MAX_SECONDS` in step) if
  you're on a Vercel plan/tier that supports longer function execution —
  this reduces how many invocations a very large one-time backlog needs to
  fully clear, though it's no longer required for correctness now that
  every run checkpoints itself either way.
