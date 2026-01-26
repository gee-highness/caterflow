// app/api/stock-items/route.ts
import { NextResponse } from 'next/server';
import { client, writeClient } from '@/lib/sanity'; // Import writeClient

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || '';

        const query = `*[_type == "StockItem" && (name match $search || sku match $search)] {
            _id,
            name,
            sku,
            unitOfMeasure,
            unitPrice,
            minimumStockLevel,
            reorderQuantity,
            category->{
                _id,
                title
            },
            suppliers[]->{
                _id,
                name
            },
            primarySupplier->{
                _id,
                name
            }
        } | order(name asc)`;

        const stockItems = await client.fetch(query, { search: `${search}*` });
        return NextResponse.json(stockItems);
    } catch (error) {
        console.error('Failed to fetch stock items:', error);
        return NextResponse.json(
            { error: 'Failed to fetch stock items' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        console.log('Received POST data:', body);

        const { name, sku, minimumStockLevel, category, primarySupplier, unitOfMeasure } = body;

        // Validate required fields
        if (!name || !sku || !category || !unitOfMeasure) {
            return NextResponse.json(
                { error: 'Missing required fields: name, sku, category, and unitOfMeasure are required' },
                { status: 400 }
            );
        }

        const document: any = {
            _type: 'StockItem',
            name: name.trim(),
            sku: sku.trim(),
            minimumStockLevel: Number(minimumStockLevel) || 0,
            unitOfMeasure,
            category: {
                _type: 'reference',
                _ref: category,
            },
            suppliers: [],
        };

        // Only add primarySupplier if provided and not empty
        if (primarySupplier && primarySupplier.trim() !== '') {
            document.primarySupplier = {
                _type: 'reference',
                _ref: primarySupplier,
            };
            // Also add the primary supplier to the suppliers array
            document.suppliers = [{
                _type: 'reference',
                _ref: primarySupplier,
            }];
        }

        console.log('Creating document:', document);
        // Use writeClient instead of client for write operations
        const result = await writeClient.create(document);
        console.log('Creation successful:', result);

        return NextResponse.json(result);
    } catch (error) {
        console.error('Failed to create stock item:', error);
        return NextResponse.json(
            { error: `Failed to create stock item: ${error instanceof Error ? error.message : 'Unknown error'}` },
            { status: 500 }
        );
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        console.log('Received PUT data:', body);

        const { _id, name, sku, minimumStockLevel, category, primarySupplier, unitOfMeasure } = body;

        if (!_id) {
            return NextResponse.json(
                { error: 'Missing _id for update' },
                { status: 400 }
            );
        }

        // Validate required fields
        if (!name || !sku || !category || !unitOfMeasure) {
            return NextResponse.json(
                { error: 'Missing required fields: name, sku, category, and unitOfMeasure are required' },
                { status: 400 }
            );
        }

        const document: any = {
            name: name.trim(),
            sku: sku.trim(),
            minimumStockLevel: Number(minimumStockLevel) || 0,
            unitOfMeasure,
            category: {
                _type: 'reference',
                _ref: category,
            },
        };

        // Handle primarySupplier
        if (primarySupplier && primarySupplier.trim() !== '') {
            document.primarySupplier = {
                _type: 'reference',
                _ref: primarySupplier,
            };
            // Ensure the primary supplier is in the suppliers array
            document.suppliers = [{
                _type: 'reference',
                _ref: primarySupplier,
            }];
        } else {
            // To remove the primary supplier
            document.primarySupplier = undefined;
        }

        console.log('Updating document:', document);
        // Use writeClient instead of client for write operations
        const result = await writeClient.patch(_id).set(document).commit();
        console.log('Update successful:', result);

        return NextResponse.json(result);
    } catch (error) {
        console.error('Failed to update stock item:', error);
        return NextResponse.json(
            { error: `Failed to update stock item: ${error instanceof Error ? error.message : 'Unknown error'}` },
            { status: 500 }
        );
    }
}