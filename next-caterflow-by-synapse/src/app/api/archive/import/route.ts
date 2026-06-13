// src/app/api/archive/import/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { decryptData } from '@/lib/encryption';
import { computeDiffAndApply } from '@/lib/archiveImporter';

export const maxDuration = 300; // allow up to 5 minutes for large imports

/**
 * POST /api/archive/import
 * Body: encrypted JSON payload produced by the export endpoint.
 * Query param `apply=true` will execute the import after validation.
 */
export async function POST(request: Request) {
  // ---- Auth ----
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
  }

  try {
    const payload = await request.json();
    // Decrypt the payload (expects { iv, data, tag })
    const plain = decryptData(payload);
    const backup = JSON.parse(plain);

    const url = new URL(request.url);
    const apply = url.searchParams.get('apply') === 'true';

    const result = await computeDiffAndApply(backup, apply);
    // result contains diff summary and, if applied, an audit record ID
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Import failed:', err);
    return NextResponse.json({ error: 'Import failed', details: err?.message }, { status: 500 });
  }
}
