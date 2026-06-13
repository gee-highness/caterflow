// src/lib/archiveImporter.ts
// Computes differences between an encrypted backup (already decrypted) and the current MongoDB archive.
// Optionally applies the backup (replace collections) and logs the import.

import { getArchiveDb, COLLECTIONS } from '@/lib/mongoClient';
import { CollectionName } from '@/lib/mongoClient';
import type { Db } from 'mongodb';

/** Simple deep equality check for JSON objects */
function isEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Compute diff and optionally apply the backup.
 * @param backup The parsed backup object (same shape as export) – { metadata, data: { collectionName: [...] } }
 * @param applyIfTrue When true, the backup data will replace current archive collections.
 * @returns An object containing diff summary and, if applied, an audit record id.
 */
export async function computeDiffAndApply(backup: any, applyIfTrue: boolean) {
  const db = await getArchiveDb();
  const diffSummary: Record<string, { added: number; removed: number; updated: number }> = {};
  const auditRecord: any = {
    importedAt: new Date().toISOString(),
    applied: applyIfTrue,
    diff: {},
  };

  // Iterate over each defined collection
  for (const key of Object.keys(COLLECTIONS) as Array<keyof typeof COLLECTIONS>) {
    const collName = COLLECTIONS[key] as CollectionName;
    const backupDocs = backup.data[collName] ?? [];
    const currentDocs = await db.collection(collName).find({}).toArray();

    const backupMap = new Map<string, any>();
    const currentMap = new Map<string, any>();
    const getId = (doc: any) => doc._sanityId || doc._id?.toString();

    backupDocs.forEach((d: any) => {
      const id = getId(d);
      if (id) backupMap.set(id, d);
    });
    currentDocs.forEach((d: any) => {
      const id = getId(d);
      if (id) currentMap.set(id, d);
    });

    let added = 0,
      removed = 0,
      updated = 0;

    // Added: present in backup but not in current
    for (const [id, doc] of backupMap.entries()) {
      if (!currentMap.has(id)) added++;
      else if (!isEqual(doc, currentMap.get(id))) updated++;
    }
    // Removed: present in current but not in backup
    for (const id of currentMap.keys()) {
      if (!backupMap.has(id)) removed++;
    }

    diffSummary[collName] = { added, removed, updated };
    auditRecord.diff[collName] = { added, removed, updated };

    if (applyIfTrue) {
      // Replace the collection with the backup data (full restore)
      await db.collection(collName).deleteMany({});
      if (backupDocs.length) {
        await db.collection(collName).insertMany(backupDocs);
      }
    }
  }

  // Store audit record if we performed an import
  let auditId = null;
  if (applyIfTrue) {
    const res = await db.collection('archive_imports').insertOne(auditRecord);
    auditId = res.insertedId?.toString();
  }

  return { diff: diffSummary, applied: applyIfTrue, auditId };
}
