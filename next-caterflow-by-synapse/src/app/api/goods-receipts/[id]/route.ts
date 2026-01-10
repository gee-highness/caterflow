// src/app/api/goods-receipts/[id]/route.ts
import { client, writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { logSanityInteraction } from '@/lib/sanityLogger';
import { NextResponse } from 'next/server';
import { revertPreviousStockChanges, updateStockForTransaction } from '@/lib/stockCalculations';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id) {
            return NextResponse.json(
                { error: 'Goods receipt ID is required' },
                { status: 400 }
            );
        }

        // FIXED: Updated query to properly expand supplier and site
        const query = groq`*[_type == "GoodsReceipt" && _id == $id][0] {
    _id,
    _type,
    receiptNumber,
    receiptDate,
    status,
    notes,
    // FIX: Properly expand purchaseOrder with supplier and site
    purchaseOrder->{
        _id,
        poNumber,
        status,
        orderDate,
        // FIX: Ensure supplier is properly expanded
        supplier->{
            _id,
            name,
            contactPerson,
            phoneNumber,
            email
        },
        // FIX: Ensure site is properly expanded
        site->{
            _id,
            name,
            location,
            contactNumber
        },
        orderedItems[] {
            _key,
            orderedQuantity,
            unitPrice,
            stockItem->{
                _id,
                name,
                sku,
                unitOfMeasure
            }
        }
    },
    receivingBin->{
        _id,
        name,
        binType,
        site->{
            _id,
            name
        }
    },
    receivedItems[] {
        _key,
        stockItem->{
            _id,
            name,
            sku,
            unitOfMeasure
        },
        orderedQuantity,
        receivedQuantity,
        batchNumber,
        expiryDate,
        condition
    },
    evidenceStatus,
    attachments[]->{
        _id,
        fileName,
        fileType,
        description,
        uploadedAt,
        "file": file{
            "asset": asset->{
                _id,
                _type,
                url,
                originalFilename,
                mimeType
            }
        }
    }
}`;

        const goodsReceipt = await client.fetch(query, { id });

        if (!goodsReceipt) {
            return NextResponse.json(
                { error: 'Goods receipt not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(goodsReceipt);
    } catch (error: any) {
        console.error("Error fetching goods receipt:", error);
        return NextResponse.json(
            { error: "Failed to fetch goods receipt", details: error.message },
            { status: 500 }
        );
    }
}

// CHANGE FROM POST TO PUT FOR UPDATES
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || !session.user) {
            return NextResponse.json(
                { error: 'User not authenticated' },
                { status: 401 }
            );
        }

        const { id } = await params;

        if (!id) {
            return NextResponse.json(
                { error: 'Goods receipt ID is required' },
                { status: 400 }
            );
        }

        const updateData = await request.json();

        // Remove _id from update data to avoid conflicts
        const { _id, ...dataToUpdate } = updateData;

        // ✅ Get existing receipt to check previous status
        const existingReceipt = await client.fetch(
            groq`*[_type == "GoodsReceipt" && _id == $id][0] { 
                status,
                receiptNumber
            }`,
            { id }
        );

        if (!existingReceipt) {
            return NextResponse.json(
                { error: 'Goods receipt not found' },
                { status: 404 }
            );
        }

        const wasCompleted = existingReceipt?.status === 'completed';
        const willBeCompleted = dataToUpdate.status === 'completed';
        const isStatusChangeToCompleted = !wasCompleted && willBeCompleted;

        // ✅ Revert if editing completed receipt with new items
        if (wasCompleted && dataToUpdate.receivedItems) {
            console.log('↩️ Reverting previous stock changes for goods receipt edit:', existingReceipt.receiptNumber);
            await revertPreviousStockChanges(id);
        }

        const result = await writeClient
            .patch(id)
            .set({
                ...dataToUpdate,
                updatedAt: new Date().toISOString()
            })
            .commit();

        // ✅ CRITICAL FIX: Update stock if receipt status changed to 'completed'
        if (isStatusChangeToCompleted) {
            console.log('📦 Updating stock for completed goods receipt:', existingReceipt.receiptNumber);
            await updateStockForTransaction('procurement', id);
        }

        await logSanityInteraction(
            'update',
            `Updated goods receipt: ${existingReceipt.receiptNumber || id}`,
            'GoodsReceipt',
            id,
            session.user.email || 'system',
            true
        );

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Failed to update goods receipt:', error);
        return NextResponse.json(
            { error: 'Failed to update goods receipt', details: error.message },
            { status: 500 }
        );
    }
}

// Optional: Add DELETE method if needed
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || !session.user) {
            return NextResponse.json(
                { error: 'User not authenticated' },
                { status: 401 }
            );
        }

        const { id } = await params;

        if (!id) {
            return NextResponse.json(
                { error: 'Goods receipt ID is required' },
                { status: 400 }
            );
        }

        const result = await writeClient.delete(id);

        await logSanityInteraction(
            'delete',
            `Deleted goods receipt: ${id}`,
            'GoodsReceipt',
            id,
            session.user.email || 'system',
            true
        );

        return NextResponse.json({ success: true, result });
    } catch (error: any) {
        console.error('Failed to delete goods receipt:', error);
        return NextResponse.json(
            { error: 'Failed to delete goods receipt', details: error.message },
            { status: 500 }
        );
    }
}