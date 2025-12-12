// src/app/api/operations/transfers/[id]/route.ts

import { NextResponse } from 'next/server';
import { client, writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';
import { logSanityInteraction } from '@/lib/sanityLogger';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { updateStockForTransaction } from '@/lib/stockCalculations';

// Helper to get current user from session
async function getCurrentUser(request: Request) {
    const session = await getServerSession(authOptions);
    return session?.user;
}
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> } // Add Promise wrapper
) {
    try {
        const { id } = await params; // Await the params

        const query = groq`*[_type == "InternalTransfer" && _id == $id][0] {
            _id,
            transferNumber,
            transferDate,
            status,
            notes,
            "fromBin": fromBin->{
                _id,
                name,
                "site": site->{name}
            },
            "toBin": toBin->{
                _id,
                name,
                "site": site->{name}
            },
            "transferredBy": transferredBy->{_id, name, email},
            "approvedBy": approvedBy->{_id, name, email},
            approvedAt,
            "transferredItems": transferredItems[]{
                _key,
                "stockItem": stockItem->{
                    _id,
                    name,
                    sku,
                    unitOfMeasure
                },
                transferredQuantity
            }
        }`;

        const transfer = await client.fetch(query, { id });

        if (!transfer) {
            return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
        }

        return NextResponse.json(transfer);
    } catch (error) {
        console.error('Failed to fetch transfer:', error);
        return NextResponse.json(
            { error: 'Failed to fetch transfer' },
            { status: 500 }
        );
    }
}

// FIX: Update the PATCH function signature for Next.js 15
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> } // Add Promise wrapper
) {
    try {
        const { id } = await params; // Await the params
        const body = await request.json();
        const user = await getCurrentUser(request);

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!body) {
            return NextResponse.json({ error: 'No data provided' }, { status: 400 });
        }

        // Get current transfer to check status and enforce workflow rules
        const currentTransfer = await client.fetch(
            groq`*[_type == "InternalTransfer" && _id == $id][0] {
                status,
                transferNumber
            }`,
            { id }
        );

        if (!currentTransfer) {
            return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
        }

        // Enforce workflow rules - only allow editing drafts and pending-approval
        if (!['draft', 'pending-approval', 'approved'].includes(currentTransfer.status)) {
            return NextResponse.json(
                { error: `Cannot edit a transfer with status: ${currentTransfer.status}` },
                { status: 403 }
            );
        }

        // Handle status transitions and validation
        let updateData: any = { ...body };

        // When submitting for approval, validate required fields
        if (body.status === 'pending-approval') {
            if (!body.fromBin || !body.toBin || !body.transferredItems || body.transferredItems.length === 0) {
                return NextResponse.json(
                    { error: 'All fields are required when submitting for approval' },
                    { status: 400 }
                );
            }
        }

        // When approving, set approvedBy and approvedAt
        if (body.status === 'approved') {
            updateData.approvedBy = {
                _type: 'reference',
                _ref: user.id,
            };
            updateData.approvedAt = new Date().toISOString();
        }

        // When completing, validate that it's approved first
        if (body.status === 'completed') {
            if (currentTransfer.status !== 'approved') {
                return NextResponse.json(
                    { error: 'Only approved transfers can be completed' },
                    { status: 400 }
                );
            }
        }

        const result = await writeClient
            .patch(id)
            .set(updateData)
            .commit();

        if (result.status === 'completed') {
            await updateStockForTransaction('transfer', result._id);
        }

        await logSanityInteraction(
            'update',
            `Updated transfer: ${currentTransfer.transferNumber || id}`,
            'InternalTransfer',
            id,
            user.id || 'system',
            true
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error('Failed to update transfer:', error);
        return NextResponse.json(
            { error: 'Failed to update transfer' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> } // Add Promise wrapper
) {
    try {
        const { id } = await params; // Await the params
        const user = await getCurrentUser(request);

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if transfer can be deleted (only drafts)
        const currentTransfer = await client.fetch(
            groq`*[_type == "InternalTransfer" && _id == $id][0] { status, transferNumber }`,
            { id }
        );

        if (!currentTransfer) {
            return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
        }

        if (currentTransfer.status !== 'draft') {
            return NextResponse.json(
                { error: 'Only draft transfers can be deleted' },
                { status: 403 }
            );
        }

        await writeClient.delete(id);

        await logSanityInteraction(
            'delete',
            `Deleted transfer: ${currentTransfer.transferNumber || id}`,
            'InternalTransfer',
            id,
            user.id || 'system',
            true
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete transfer:', error);
        return NextResponse.json(
            { error: 'Failed to delete transfer' },
            { status: 500 }
        );
    }
}