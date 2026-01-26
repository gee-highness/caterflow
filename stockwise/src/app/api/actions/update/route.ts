//api/actions/update/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { writeClient } from '@/lib/sanity';

export async function POST(request: NextRequest) {
    try {
        const { id, completedSteps, status, approvedBy, approvedAt } = await request.json();

        if (!id) {
            return NextResponse.json(
                { error: 'Action ID is required' },
                { status: 400 }
            );
        }

        // Validate the document exists first
        const existingDoc = await writeClient.getDocument(id);
        if (!existingDoc) {
            return NextResponse.json(
                { error: 'Document not found' },
                { status: 404 }
            );
        }

        const patch = writeClient.patch(id);

        if (typeof completedSteps === 'number') {
            patch.set({ completedSteps });
        }

        if (status) {
            // Validate status for PurchaseOrder documents
            if (existingDoc._type === 'PurchaseOrder') {
                const validStatuses = ['draft', 'pending-approval', 'approved', 'processing', 'partially-received', 'complete', 'cancelled'];
                if (!validStatuses.includes(status)) {
                    return NextResponse.json(
                        { error: `Invalid status for PurchaseOrder: ${status}` },
                        { status: 400 }
                    );
                }
            }

            patch.set({ status });

            // If approving a purchase order, set approvedBy and approvedAt
            if (status === 'approved' && approvedBy && approvedAt) {
                patch.set({
                    approvedBy: { _type: 'reference', _ref: approvedBy },
                    approvedAt: approvedAt
                });
            }
        }

        const result = await patch.commit();

        return NextResponse.json({ success: true, result });
    } catch (error: any) {
        console.error('Failed to update action:', error);
        return NextResponse.json(
            {
                error: 'Failed to update action',
                details: error.message
            },
            { status: 500 }
        );
    }
}