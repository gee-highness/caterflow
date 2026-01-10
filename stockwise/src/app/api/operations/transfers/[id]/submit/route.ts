// src/app/api/operations/transfers/[id]/submit/route.ts
import { NextResponse } from 'next/server';
import { writeClient } from '@/lib/sanity';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { logSanityInteraction } from '@/lib/sanityLogger';
import { updateStockForTransaction } from '@/lib/stockCalculations';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
        }

        const { id } = await params;
        if (!id) return NextResponse.json({ error: 'Transfer ID required' }, { status: 400 });

        const now = new Date().toISOString();

        const patch = writeClient.patch(id).set({
            status: 'pending-approval',
            approvalRequestedBy: { _type: 'reference', _ref: session.user.id },
            approvalRequestedAt: now,
            updatedAt: now,
        });

        const result = await patch.commit();

        if (result.status === 'completed') {
            await updateStockForTransaction('transfer', result._id);
        }

        await logSanityInteraction(
            'submit',
            `Submitted transfer ${result.transferNumber} for approval.`,
            'InternalTransfer',
            id,
            session.user.id,
            true
        );

        return NextResponse.json(result);
    } catch (err: any) {
        console.error('Failed to submit transfer for approval:', err);
        return NextResponse.json({ error: 'Failed to submit transfer for approval', details: err.message }, { status: 500 });
    }
}
