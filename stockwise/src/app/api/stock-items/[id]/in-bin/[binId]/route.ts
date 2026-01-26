// src/app/api/stock-items/[id]/in-bin/[binId]/route.ts
import { calculateStock } from '@/lib/stockCalculations';
import { NextResponse } from 'next/server';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string; binId: string }> } // Change to Promise
) {
    // Await params in Next.js 15
    const { id, binId } = await params;

    try {
        if (!id || !binId) {
            return NextResponse.json(
                { error: 'Both Stock Item ID and Bin ID are required.' },
                { status: 400 }
            );
        }

        // Correct ID validation for Sanity document IDs
        // Assuming stock item IDs start with "stockitem-" and bin IDs start with "XB"
        if (!id.startsWith('stockitem-') || !binId.startsWith('XB')) {
            return NextResponse.json(
                { error: 'Invalid ID format' },
                { status: 400 }
            );
        }

        const inStock = await calculateStock(id, binId);
        return NextResponse.json({ inStock });
    } catch (error) {
        console.error('Failed to fetch stock quantity:', error);
        return NextResponse.json(
            { error: 'Failed to fetch bin-specific stock quantity' },
            { status: 500 }
        );
    }
}