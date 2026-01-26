// src/app/api/purchase-orders/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { client, writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';
import { logSanityInteraction } from '@/lib/sanityLogger';
import { nanoid } from 'nanoid';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserSiteInfo, buildSiteFilter } from '@/lib/siteFiltering';

/**
 * Helper to set no-cache headers on a NextResponse
 */
function setNoCache(res: NextResponse) {
    res.headers.set(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
    );
    res.headers.set('Pragma', 'no-cache');
    res.headers.set('Expires', '0');
    return res;
}

const getNextPONumber = async (): Promise<string> => {
    try {
        // Get all PO numbers and find the maximum
        const query = groq`*[_type == "PurchaseOrder" && defined(poNumber)].poNumber`;
        const allPONumbers = await client.fetch(query);

        let maxNumber = 0;

        if (allPONumbers && allPONumbers.length > 0) {
            allPONumbers.forEach((poNumber: string) => {
                if (poNumber && poNumber.startsWith('PO-')) {
                    const numberPart = poNumber.split('-')[1];
                    const currentNumber = parseInt(numberPart);
                    if (!isNaN(currentNumber) && currentNumber > maxNumber) {
                        maxNumber = currentNumber;
                    }
                }
            });
        }

        // Generate the next number
        const nextNumber = maxNumber + 1;
        const newPONumber = `PO-${String(nextNumber).padStart(5, '0')}`;

        // Double-check this number doesn't already exist (concurrency safety)
        const checkQuery = groq`count(*[_type == "PurchaseOrder" && poNumber == $newNumber])`;
        const existingCount = await client.fetch(checkQuery, { newNumber: newPONumber });

        if (existingCount > 0) {
            // If it exists, try the next number
            return `PO-${String(nextNumber + 1).padStart(5, '0')}`;
        }

        return newPONumber;
    } catch (error) {
        console.error('Error generating PO number:', error);
        // Fallback with timestamp to ensure uniqueness
        const timestamp = new Date().getTime();
        return `PO-${String(timestamp).slice(-5)}`;
    }
};

/**
 * GET handler to fetch all purchase orders or a specific one by query parameter
 */
export async function GET(request: Request) {
    try {
        // Instruct Next to avoid caching for this route
        try {
            noStore();
        } catch (e) {
            // noStore is unstable in some environments — non-fatal
            console.warn('noStore() failed (non-fatal). Continuing.');
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const status = searchParams.get('status');

        // Get user site info for filtering
        const userSiteInfo = await getUserSiteInfo(request);
        const siteFilter = buildSiteFilter(userSiteInfo, 'site._ref');

        // GROQ query projection for purchase order details
        const purchaseOrderProjection = `{
            _id,
            _type,
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
            totalAmount,
            "hasReceipts": count(*[_type == "GoodsReceipt" && purchaseOrder._ref == ^._id]) > 0
        }`;

        // If an ID is provided, fetch a specific purchase order
        if (id) {
            const query = groq`*[_type == "PurchaseOrder" && _id == $id ${siteFilter}] ${purchaseOrderProjection}`;
            const purchaseOrder = await client.fetch(query, { id });

            if (!purchaseOrder || purchaseOrder.length === 0) {
                const res = NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
                return setNoCache(res);
            }

            // Check if user has permission to access this PO
            if (!userSiteInfo.canAccessMultipleSites && purchaseOrder[0].site?._id !== userSiteInfo.userSiteId) {
                const res = NextResponse.json({ error: 'Access denied to this purchase order' }, { status: 403 });
                return setNoCache(res);
            }

            // Manually get unique supplier names from the fetched data
            const suppliers = purchaseOrder[0].orderedItems
                .map((item: any) => item.supplier?.name)
                .filter((name: string | undefined) => name && name.trim() !== '');

            const uniqueSupplierNames = suppliers.length > 0
                ? [...new Set(suppliers)].join(', ')
                : 'No suppliers specified';

            const res = NextResponse.json({
                ...purchaseOrder[0],
                supplierNames: uniqueSupplierNames
            });
            return setNoCache(res);
        }

        // Build the base query - only filter by status if provided
        let baseQuery = `*[_type == "PurchaseOrder" ${siteFilter}`;
        const queryParams: any = {};

        // Add status filter if provided
        if (status) {
            baseQuery += ` && status == $status`;
            queryParams.status = status;
        }

        // Complete the query with a closing bracket, ordering, and projection
        const allQuery = groq`${baseQuery}] | order(orderDate desc) ${purchaseOrderProjection}`;

        let purchaseOrders = await client.fetch(allQuery, queryParams);

        // Manually process all purchase orders to add the unique supplier names
        const processedOrders = (purchaseOrders || []).map((order: any) => {
            const suppliers = order.orderedItems
                .map((item: any) => item.supplier?.name)
                .filter((name: string | undefined) => name && name.trim() !== '');

            const uniqueSupplierNames = suppliers.length > 0
                ? [...new Set(suppliers)].join(', ')
                : 'No suppliers specified';

            return {
                ...order,
                supplierNames: uniqueSupplierNames
            };
        });

        const res = NextResponse.json(processedOrders);
        return setNoCache(res);
    } catch (error: any) {
        console.error('Error fetching purchase orders:', error);
        const res = NextResponse.json(
            { error: 'Failed to fetch purchase orders', details: error?.message || String(error) },
            { status: 500 }
        );
        return setNoCache(res);
    }
}

/**
 * POST handler to create a new purchase order.
 */
export async function POST(request: Request) {
    try {
        // Instruct Next to avoid caching for this route
        try {
            noStore();
        } catch (e) {
            console.warn('noStore() failed (non-fatal). Continuing.');
        }

        const session = await getServerSession(authOptions);

        if (!session?.user) {
            const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            return setNoCache(res);
        }

        const {
            poNumber,
            orderDate,
            orderedBy,
            orderedItems,
            totalAmount,
            status,
            site
        } = await request.json();

        // Get user site info for permission checking
        const userSiteInfo = await getUserSiteInfo(request);

        // --- 1. Basic Payload Validation ---
        if (!orderedBy || !site || !orderedItems || orderedItems.length === 0) {
            const res = NextResponse.json(
                { error: 'Missing required fields: orderedBy, site, or orderedItems' },
                { status: 400 }
            );
            return setNoCache(res);
        }

        // --- 2. Check if user has permission to create PO for this site ---
        if (!userSiteInfo.canAccessMultipleSites && site !== userSiteInfo.userSiteId) {
            const res = NextResponse.json(
                { error: 'Access denied to create purchase order for this site' },
                { status: 403 }
            );
            return setNoCache(res);
        }

        // --- 3. Validate Items (supplier is now optional) ---
        for (const item of orderedItems) {
            // Only validate supplier if it's provided (supplier is now optional)
            if (item.supplier) {
                const supplierExists = await client.fetch(
                    groq`count(*[_type == "Supplier" && _id == $supplierId]) > 0`,
                    { supplierId: item.supplier }
                );

                if (!supplierExists) {
                    const res = NextResponse.json(
                        { error: `Supplier ${item.supplier} does not exist. Please try again.` },
                        { status: 400 }
                    );
                    return setNoCache(res);
                }
            }
        }

        // --- 4. Construct Sanity Document (only after all validation passes) ---
        const poDocument = {
            _type: 'PurchaseOrder',
            poNumber: poNumber || await getNextPONumber(),
            orderDate: orderDate || new Date().toISOString(),
            orderedBy: {
                _type: 'reference',
                _ref: orderedBy
            },
            site: {
                _type: 'reference',
                _ref: site
            },
            orderedItems: orderedItems.map((item: any) => ({
                _key: item._key || nanoid(),
                orderedQuantity: item.orderedQuantity || 1,
                unitPrice: item.unitPrice || 0,
                stockItem: {
                    _type: 'reference',
                    _ref: item.stockItem
                },
                // Only include supplier if provided (supplier is now optional)
                ...(item.supplier && {
                    supplier: {
                        _type: 'reference',
                        _ref: item.supplier
                    }
                })
            })),
            totalAmount: totalAmount || 0,
            status: status || 'draft',
            _id: nanoid()
        };

        // --- 5. Create document and return success response ---
        const result = await writeClient.create(poDocument);

        await logSanityInteraction(
            'create',
            `Created purchase order: ${poDocument.poNumber}`,
            'PurchaseOrder',
            result._id,
            session.user.id,
            true
        );

        const res = NextResponse.json(result);
        return setNoCache(res);
    } catch (error: any) {
        console.error('Failed to create purchase order:', error);
        const res = NextResponse.json(
            {
                error: 'Failed to create purchase order',
                details: error?.message || String(error),
                stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
            },
            { status: 500 }
        );
        return setNoCache(res);
    }
}

/**
 * PATCH handler to update an existing purchase order.
 */
export async function PATCH(request: Request) {
    try {
        // Instruct Next to avoid caching for this route
        try {
            noStore();
        } catch (e) {
            console.warn('noStore() failed (non-fatal). Continuing.');
        }

        const session = await getServerSession(authOptions);

        if (!session?.user) {
            const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            return setNoCache(res);
        }

        const body = await request.json();
        const { _id, updateData } = body;
        const userSiteInfo = await getUserSiteInfo(request);

        if (!_id || !updateData) {
            const res = NextResponse.json(
                { error: 'Purchase order ID and update data are required' },
                { status: 400 }
            );
            return setNoCache(res);
        }

        // Check if PO exists and user has access
        const existingPO = await client.fetch(
            groq`*[_type == "PurchaseOrder" && _id == $id][0] {
                _id,
                site->{
                    _id,
                    name
                }
            }`,
            { id: _id }
        );

        if (!existingPO) {
            const res = NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
            return setNoCache(res);
        }

        if (!userSiteInfo.canAccessMultipleSites && existingPO.site?._id !== userSiteInfo.userSiteId) {
            const res = NextResponse.json({ error: 'Access denied to update this purchase order' }, { status: 403 });
            return setNoCache(res);
        }

        // Start building the patch
        let patch = writeClient.patch(_id);

        // Handle general top-level updates
        if (Object.keys(updateData).some(key => key !== 'orderedItems')) {
            const cleanUpdateData = { ...updateData };
            delete cleanUpdateData.orderedItems;

            // Add top-level updates to patch
            patch = patch.set(cleanUpdateData);
        }

        // Handle orderedItems updates - if we need to replace the entire array
        if (updateData.orderedItems && Array.isArray(updateData.orderedItems)) {
            // If you want to replace the entire orderedItems array
            patch = patch.set({
                orderedItems: updateData.orderedItems.map((item: any) => ({
                    _key: item._key || nanoid(),
                    orderedQuantity: item.orderedQuantity || 0,
                    unitPrice: item.unitPrice || 0,
                    stockItem: {
                        _type: 'reference',
                        _ref: item.stockItem
                    },
                    ...(item.supplier && {
                        supplier: {
                            _type: 'reference',
                            _ref: item.supplier
                        }
                    })
                }))
            });
        }

        // Commit the patch
        const purchaseOrder = await patch.commit();

        await logSanityInteraction(
            'update',
            `Updated purchase order: ${purchaseOrder._id}`,
            'PurchaseOrder',
            _id,
            session.user.id,
            true
        );

        const res = NextResponse.json(purchaseOrder);
        return setNoCache(res);
    } catch (error: any) {
        console.error('Failed to update purchase order:', error);
        const res = NextResponse.json(
            {
                error: 'Failed to update purchase order',
                details: error?.message || String(error),
                // Add more debugging info in development
                ...(process.env.NODE_ENV === 'development' && {
                    stack: error?.stack,
                    fullError: error
                })
            },
            { status: 500 }
        );
        return setNoCache(res);
    }
}

/**
 * DELETE handler to remove a purchase order by ID.
 */
export async function DELETE(request: Request) {
    try {
        // Instruct Next to avoid caching for this route
        try {
            noStore();
        } catch (e) {
            console.warn('noStore() failed (non-fatal). Continuing.');
        }

        const session = await getServerSession(authOptions);

        if (!session?.user) {
            const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            return setNoCache(res);
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const userSiteInfo = await getUserSiteInfo(request);

        if (!id) {
            const res = NextResponse.json(
                { error: 'Purchase order ID is required' },
                { status: 400 }
            );
            return setNoCache(res);
        }

        // Check if PO exists and user has access
        const existingPO = await client.fetch(
            groq`*[_type == "PurchaseOrder" && _id == $id][0] {
                _id,
                site->_id
            }`,
            { id }
        );

        if (!existingPO) {
            const res = NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
            return setNoCache(res);
        }

        if (!userSiteInfo.canAccessMultipleSites && existingPO.site._id !== userSiteInfo.userSiteId) {
            const res = NextResponse.json({ error: 'Access denied to delete this purchase order' }, { status: 403 });
            return setNoCache(res);
        }

        await writeClient.delete(id);

        await logSanityInteraction(
            'delete',
            `Deleted purchase order: ${id}`,
            'PurchaseOrder',
            id,
            session.user.id,
            true
        );

        const res = NextResponse.json({ success: true });
        return setNoCache(res);
    } catch (error: any) {
        console.error('Failed to delete purchase order:', error);
        const res = NextResponse.json(
            { error: 'Failed to delete purchase order', details: error?.message || String(error) },
            { status: 500 }
        );
        return setNoCache(res);
    }
}