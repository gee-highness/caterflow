// src/app/api/purchase-orders/update-items/route.ts
import { NextResponse } from 'next/server';
import { writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function POST(request: Request) {
    try {
        const { poId, updates } = await request.json();

        if (!poId || !updates || !Array.isArray(updates)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Fetch current PO - FIXED: Use correct type "PurchaseOrder"
        const currentPO = await writeClient.fetch(
            `*[_type == "PurchaseOrder" && _id == $poId][0]`,
            { poId }
        );

        if (!currentPO) {
            return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
        }

        // Build updated orderedItems array
        const updatedOrderedItems = (currentPO.orderedItems || []).map((item: any) => {
            const u = updates.find((upd: any) => upd.itemKey === item._key);
            if (u) {
                const newItem = { ...item };

                if (u.newPrice !== undefined) {
                    newItem.unitPrice = u.newPrice;
                }
                if (u.newQuantity !== undefined) {
                    newItem.orderedQuantity = u.newQuantity;
                }
                if (u.supplierId) {
                    newItem.supplier = {
                        _type: 'reference',
                        _ref: u.supplierId
                    };
                }

                return newItem;
            }
            return item;
        });

        // Persist the updated orderedItems array
        const result = await writeClient
            .patch(poId)
            .set({ orderedItems: updatedOrderedItems })
            .commit();

        // Re-fetch the updated PO - FIXED: Use correct type "PurchaseOrder"
        const query = groq`
            *[_type == "PurchaseOrder" && _id == $poId][0]{
                _id,
                _type,
                poNumber,
                orderDate,
                status,
                totalAmount,
                "site": site->{_id, name},
                "orderedBy": orderedBy->{name},
                orderedItems[]{
                    _key,
                    orderedQuantity,
                    unitPrice,
                    "stockItem": stockItem->{_id, name, unitOfMeasure},
                    "supplier": supplier->{_id, name}
                }
            }
        `;
        const updatedPO = await writeClient.fetch(query, { poId });

        if (!updatedPO) {
            return NextResponse.json({ error: 'Failed to fetch updated purchase order' }, { status: 500 });
        }

        // Manually generate supplier names
        const supplierNames = updatedPO.orderedItems
            ?.map((item: any) => item.supplier?.name)
            .filter((name: string) => name && name.trim() !== '') || [];

        const uniqueSupplierNames = supplierNames.length > 0
            ? [...new Set(supplierNames)].join(', ')
            : 'No suppliers specified';

        // Transform for UI
        const transformedPO = {
            ...updatedPO,
            supplierNames: uniqueSupplierNames,
            siteName: updatedPO.site?.name || '',
            actionType: 'PurchaseOrder',
            title: `Purchase Order ${updatedPO.poNumber}`,
            description: `Order from ${uniqueSupplierNames}`,
            priority: 'medium',
            createdAt: updatedPO.orderDate,
        };

        return NextResponse.json({
            success: true,
            updatedPO: transformedPO
        });
    } catch (error: any) {
        console.error('Failed to update items:', error);
        return NextResponse.json(
            { error: 'Failed to update items', details: error?.message || String(error) },
            { status: 500 }
        );
    }
}