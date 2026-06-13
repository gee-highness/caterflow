// src/app/api/archive/run/route.ts
// Cron trigger endpoint — called daily at midnight by Vercel Cron
// Also accepts manual POST from admin users

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { runArchive } from '@/lib/archiveService';

export const maxDuration = 300; // 5 minutes — Vercel Pro allows up to 300s

export async function POST(request: Request) {
    // ── Authentication: Accept either Vercel Cron secret OR admin session ──

    const headersList = await headers();
    const cronSecret = headersList.get('x-cron-secret') || headersList.get('authorization');
    const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

    const isCronCall = cronSecret === expectedSecret;

    if (!isCronCall) {
        // Check for authenticated admin session (manual trigger)
        const session = await getServerSession(authOptions);
        if (!session?.user || session.user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    console.log(`\n🚀 Archive run triggered by: ${isCronCall ? 'Vercel Cron' : 'Admin user'}`);

    try {
        const result = await runArchive();

        const totalArchived = Object.values(result.archived).reduce((a, b) => a + b, 0);

        return NextResponse.json({
            success: true,
            runId: result.runId,
            totalArchived,
            breakdown: result.archived,
            errors: result.errors,
            durationMs: result.durationMs,
            startedAt: result.startedAt,
            completedAt: result.completedAt,
        });
    } catch (error: any) {
        console.error('❌ Archive run failed:', error);
        return NextResponse.json(
            { success: false, error: error?.message || 'Archive run failed' },
            { status: 500 }
        );
    }
}

// Allow GET for quick health check
export async function GET() {
    return NextResponse.json({
        status: 'Archive endpoint ready',
        schedule: 'Daily at midnight (UTC)',
        threshold: `${process.env.ARCHIVE_DAYS_THRESHOLD || 90} days`,
    });
}
