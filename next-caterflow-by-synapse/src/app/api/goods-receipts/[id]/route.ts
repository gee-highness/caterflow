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

        // In /api/goods-receipts/[id]/route.ts - Fix the GROQ query
        const query = groq`*[_type == "GoodsReceipt" && _id == $id][0] {
    _id,
    _type,
    receiptNumber,
    receiptDate,
    status,
    notes,
    purchaseOrder->{
        _id,
        poNumber,
        status,
        orderDate,
        supplier->{
            _id,
            name
        },
        site->{
            _id,
            name
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


        // ✅ ADD: Get existing for revert
        const existingReceipt = await client.fetch(
            groq`*[_type == "GoodsReceipt" && _id == $id][0] { status }`,
            { id }
        );

        // ✅ ADD: Revert if editing completed receipt
        const wasCompleted = existingReceipt?.status === 'completed';
        if (wasCompleted && dataToUpdate.receivedItems) {
            await revertPreviousStockChanges(id);
        }



        const result = await writeClient
            .patch(id)
            .set({
                ...dataToUpdate,
                updatedAt: new Date().toISOString()
            })
            .commit();

        if (result.status === 'completed') {
            await updateStockForTransaction('procurement', result._id);
        }

        await logSanityInteraction(
            'update',
            `Updated goods receipt: ${id}`,
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