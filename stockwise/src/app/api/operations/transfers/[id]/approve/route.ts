// src/app/api/operations/transfers/[id]/approve/route.ts
import { NextResponse } from 'next/server';
import { writeClient } from '@/lib/sanity';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { logSanityInteraction } from '@/lib/sanityLogger';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
        }

        const { id } = await params;
        if (!id) return NextResponse.json({ error: 'Transfer ID required' }, { status: 400 });

        const userRole = (session.user as any).role;
        // allow admin, auditor, siteManager to approve — adapt to your rules
        if (!['admin', 'auditor', 'siteManager'].includes(userRole)) {
            return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
        }

        const now = new Date().toISOString();

        const patch = writeClient.patch(id).set({
            status: 'approved',
            approvedBy: { _type: 'reference', _ref: session.user.id },
            approvedAt: now,
            updatedAt: now,
        });

        const result = await patch.commit();

        await logSanityInteraction(
            'approve',
            `Approved transfer ${result.transferNumber}.`,
            'InternalTransfer',
            id,
            session.user.id,
            true
        );

        return NextResponse.json(result);
    } catch (err: any) {
        console.error('Failed to approve transfer:', err);
        return NextResponse.json({ error: 'Failed to approve transfer', details: err.message }, { status: 500 });
    }
}
