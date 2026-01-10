// src/app/api/stock/current/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { calculateBulkStock } from '@/lib/stockCalculations';

export async function GET(request: NextRequest) {
	try {
		const searchParams = request.nextUrl.searchParams;
		const stockItemId = searchParams.get('stockItemId');
		const binId = searchParams.get('binId');

		if (!stockItemId || !binId) {
			return NextResponse.json(
				{ error: 'Missing stockItemId or binId' },
				{ status: 400 }
			);
		}

		// Use the same function as the current stock page
		const stockResults = await calculateBulkStock([stockItemId], [binId]);
		const key = `${stockItemId}-${binId}`;
		const currentStock = stockResults[key] || 0;

		return NextResponse.json({
			success: true,
			currentStock,
			stockItemId,
			binId,
			timestamp: new Date().toISOString()
		});
	} catch (error: any) {
		console.error('Error getting current stock:', error);
		return NextResponse.json(
			{ error: 'Failed to get current stock', details: error.message },
			{ status: 500 }
		);
	}
}