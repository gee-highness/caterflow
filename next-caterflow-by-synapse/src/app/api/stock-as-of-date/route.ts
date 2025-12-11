import { NextRequest, NextResponse } from 'next/server';
import { getStockAsOfDate } from '@/lib/stockCalculations';

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { stockItemIds, binIds, asOfDate } = body;

		if (!stockItemIds || !Array.isArray(stockItemIds) || stockItemIds.length === 0) {
			return NextResponse.json(
				{ error: 'Invalid stockItemIds' },
				{ status: 400 }
			);
		}

		if (!binIds || !Array.isArray(binIds) || binIds.length === 0) {
			return NextResponse.json(
				{ error: 'Invalid binIds' },
				{ status: 400 }
			);
		}

		if (!asOfDate) {
			return NextResponse.json(
				{ error: 'asOfDate is required' },
				{ status: 400 }
			);
		}

		const targetDate = new Date(asOfDate);

		// Use the same calculation function as other pages
		const stockResults = await getStockAsOfDate(stockItemIds, binIds, targetDate);

		// Calculate summary
		let totalValue = 0;
		const itemDetails: { [key: string]: any } = {};

		// Get item details for value calculation
		const stockItemsResponse = await fetch(`${process.env.NEXTAUTH_URL}/api/stock-items`);
		const stockItems = await stockItemsResponse.json();

		// Create a map for quick lookup
		const itemMap = new Map();
		stockItems.forEach((item: any) => {
			itemMap.set(item._id, item);
		});

		// Calculate total value
		for (const [key, quantity] of Object.entries(stockResults)) {
			if (typeof quantity === 'number' && quantity > 0) {
				const [itemId, binId] = key.split('-');
				const item = itemMap.get(itemId);
				if (item) {
					const itemValue = quantity * (item.unitPrice || 0);
					totalValue += itemValue;

					if (!itemDetails[itemId]) {
						itemDetails[itemId] = {
							name: item.name,
							sku: item.sku,
							unitPrice: item.unitPrice || 0,
							totalStock: 0,
							totalValue: 0,
							bins: {}
						};
					}

					itemDetails[itemId].totalStock += quantity;
					itemDetails[itemId].totalValue += itemValue;
					itemDetails[itemId].bins[binId] = quantity;
				}
			}
		}

		return NextResponse.json({
			success: true,
			summary: {
				totalItems: stockItemIds.length,
				totalBins: binIds.length,
				totalCombinations: Object.keys(stockResults).length,
				totalValue,
				calculatedAt: new Date().toISOString(),
				asOfDate: targetDate.toISOString()
			},
			stockResults,
			itemDetails
		});

	} catch (error: any) {
		console.error('❌ Error in stock-as-of-date API:', error);
		return NextResponse.json(
			{ error: 'Failed to calculate stock', details: error.message },
			{ status: 500 }
		);
	}
}