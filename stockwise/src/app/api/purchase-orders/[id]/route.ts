// src/app/api/purchase-orders/[id]/route.ts
import { NextResponse } from 'next/server';
import { client, writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';
import { logSanityInteraction } from '@/lib/sanityLogger';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id) {
            return NextResponse.json(
                { error: 'Purchase Order ID is required' },
                { status: 400 }
            );
        }

        const query = groq`
            *[_type == "PurchaseOrder" && _id == $id][0] {
                _id,
                poNumber,
                site->{name, _id},
                orderedItems[] {
                    _key,
                    orderedQuantity,
                    unitPrice,
                    stockItem->{
                        _id,
                        name,
                        sku,
                        unitOfMeasure
                    },
                    supplier->{
                        _id,
                        name
                    }
                },
                status,
                orderDate,
                _createdAt,
                orderedBy->{ name },
                totalAmount
            }
        `;

        const poDetails = await client.fetch(query, { id });

        if (!poDetails) {
            return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 });
        }

        // Generate supplier names for consistency with the main route
        const suppliers = poDetails.orderedItems
            ?.map((item: any) => item.supplier?.name)
            .filter((name: string) => name && name.trim() !== '') || [];

        const supplierNames = suppliers.length > 0
            ? [...new Set(suppliers)].join(', ')
            : 'No suppliers specified';

        return NextResponse.json({
            ...poDetails,
            supplierNames
        });
    } catch (error) {
        console.error('Failed to fetch purchase order details:', error);
        return NextResponse.json(
            { error: 'Failed to fetch purchase order details', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// Add this to your existing [id]/route.ts file
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { updateData } = body;

        if (!id || !updateData) {
            return NextResponse.json(
                { error: 'Purchase Order ID and update data are required' },
                { status: 400 }
            );
        }

        // Update the purchase order
        const result = await writeClient
            .patch(id)
            .set(updateData)
            .commit();

        await logSanityInteraction(
            'update',
            `Updated purchase order status to: ${updateData.status}`,
            'PurchaseOrder',
            id,
            'system',
            true
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error('Failed to update purchase order:', error);
        return NextResponse.json(
            { error: 'Failed to update purchase order', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}