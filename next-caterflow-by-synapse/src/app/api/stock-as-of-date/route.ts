// src/app/api/stock-as-of-date/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getStockAsOfDate } from '@/lib/stockCalculations';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function POST(request: NextRequest) {
	try {
		const { stockItemIds, binIds, asOfDate } = await request.json();

		if (!stockItemIds || !binIds || !asOfDate) {
			return NextResponse.json(
				{ error: 'Missing required parameters: stockItemIds, binIds, asOfDate' },
				{ status: 400 }
			);
		}

		console.log('📅 Calculating stock as of:', asOfDate, 'for', stockItemIds.length, 'items across', binIds.length, 'bins');

		// Use the getStockAsOfDate function from stockCalculations
		const stockResults = await getStockAsOfDate(stockItemIds, binIds, new Date(asOfDate));

		// Get stock item details for value calculation
		const stockItemsQuery = groq`*[_type == "StockItem" && _id in $stockItemIds] {
            _id,
            name,
            unitPrice,
            isVATApplicable
        }`;

		const stockItems = await client.fetch(stockItemsQuery, { stockItemIds });

		// Calculate total value
		let totalValue = 0;
		let totalVAT = 0;

		stockItems.forEach((item: any) => {
			binIds.forEach((binId: string) => {
				const key = `${item._id}-${binId}`;
				const quantity = stockResults[key] || 0;
				const itemValue = quantity * (item.unitPrice || 0);
				totalValue += itemValue;

				// Calculate VAT if applicable
				if (item.isVATApplicable !== false) {
					totalVAT += itemValue * 0.15; // 15% VAT
				}
			});
		});

		return NextResponse.json({
			stockResults,
			summary: {
				totalValue,
				totalVAT,
				totalValueWithVAT: totalValue + totalVAT,
				itemCount: stockItemIds.length,
				binCount: binIds.length,
				asOfDate
			},
			stockItems: stockItems.map((item: any) => ({
				_id: item._id,
				name: item.name,
				unitPrice: item.unitPrice,
				isVATApplicable: item.isVATApplicable !== false
			}))
		});

	} catch (error) {
		console.error('Error calculating stock as of date:', error);
		return NextResponse.json(
			{ error: 'Failed to calculate historical stock' },
			{ status: 500 }
		);
	}
}