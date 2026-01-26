// /api/purchase-orders/update-item/route.ts
import { NextResponse } from 'next/server';
import { writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function POST(request: Request) {
    try {
        const { poId, itemKey, newPrice, newQuantity } = await request.json();

        if (!poId || !itemKey) {
            return NextResponse.json({ error: 'Missing required fields: poId and itemKey are required' }, { status: 400 });
        }

        // First, get the stock item reference from the purchase order
        const poQuery = groq`*[_type == "PurchaseOrder" && _id == $poId][0] {
            orderedItems[_key == $itemKey][0] {
                "stockItemId": stockItem._ref
            }
        }`;

        const poData = await writeClient.fetch(poQuery, { poId, itemKey });
        const stockItemId = poData?.orderedItems?.stockItemId;

        if (!stockItemId) {
            return NextResponse.json({ error: 'Stock item not found in purchase order' }, { status: 404 });
        }

        const transaction = writeClient.transaction();

        // Update price in purchase order if provided
        if (newPrice !== undefined && newPrice !== null) {
            transaction.patch(poId, (patch) =>
                patch.set({
                    [`orderedItems[_key=="${itemKey}"].unitPrice`]: newPrice,
                    [`orderedItems[_key=="${itemKey}"].priceManuallyUpdated`]: true,
                })
            );

            // Update price in stock item
            transaction.patch(stockItemId, (patch) =>
                patch.set({
                    unitPrice: newPrice,
                })
            );
        }

        // Update quantity in purchase order if provided
        if (newQuantity !== undefined && newQuantity !== null) {
            transaction.patch(poId, (patch) =>
                patch.set({
                    [`orderedItems[_key=="${itemKey}"].orderedQuantity`]: newQuantity,
                })
            );
        }

        await transaction.commit();

        return NextResponse.json({
            success: true,
            message: 'Item updated successfully',
            updatedFields: {
                ...(newPrice !== undefined && { price: newPrice }),
                ...(newQuantity !== undefined && { quantity: newQuantity })
            }
        });
    } catch (error: any) {
        console.error('Failed to update item:', error);
        return NextResponse.json(
            {
                error: 'Failed to update item',
                details: error.message
            },
            { status: 500 }
        );
    }
}