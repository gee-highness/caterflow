// src/app/api/archive/status/route.ts
// Returns recent archive run logs for monitoring

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRecentArchiveRuns } from '@/lib/archiveQueries';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || !['admin', 'auditor'].includes(session.user.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '10', 10);

        const runs = await getRecentArchiveRuns(Math.min(limit, 50));

        // Sanitize MongoDB _id for JSON serialization
        const serialized = runs.map(run => ({
            ...run,
            _id: run._id?.toString(),
        }));

        return NextResponse.json({
            runs: serialized,
            count: serialized.length,
        });
    } catch (error: any) {
        console.error('Failed to fetch archive status:', error);
        return NextResponse.json(
            { error: 'Failed to fetch archive runs', details: error?.message },
            { status: 500 }
        );
    }
}
