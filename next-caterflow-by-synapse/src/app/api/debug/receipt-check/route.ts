// src/app/api/debug/receipt-check/route.ts
import { NextResponse } from 'next/server';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const receiptId = searchParams.get('receiptId') || '95adeb54-b69e-4aba-abc4-4f5d0ec6a62c';

	const receipt = await client.fetch(
		groq`*[_type == "GoodsReceipt" && _id == $receiptId][0]{
      _id,
      receiptNumber,
      status,
      "documentBinId": receivingBin._ref,
      "documentBinName": receivingBin->name,
      "receivedItems": receivedItems[]{
        _key,
        "stockItemId": stockItem._ref,
        "stockItemName": stockItem->name,
        orderedQuantity,
        receivedQuantity,
        totalPrice,
        unitPrice,
        "binId": receivingBin._ref,
        "binName": receivingBin->name
      }
    }`,
		{ receiptId }
	);

	if (!receipt) {
		return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
	}

	// Check stock registry for each item
	const stockChecks = await Promise.all(
		receipt.receivedItems.map(async (item: any) => {
			if (!item.binId) {
				return {
					item: item.stockItemName,
					bin: 'No bin',
					ordered: item.orderedQuantity,
					received: item.receivedQuantity,
					unitPrice: item.unitPrice,
					totalPrice: item.totalPrice,
					currentStock: 'N/A',
					error: 'No bin assigned'
				};
			}

			try {
				// Get current stock from registry
				const registry = await client.fetch(
					groq`*[_type == "stockRegistry"][0] {
            stockData
          }`,
					{ stockItemId: item.stockItemId, binId: item.binId }
				);

				let currentStock = 0;
				let lastUpdated = null;

				if (registry?.stockData?.items) {
					const itemEntry = registry.stockData.items.find(
						(i: any) => i.stockItemId === item.stockItemId
					);

					if (itemEntry?.binQuantities?.bins) {
						const binEntry = itemEntry.binQuantities.bins.find(
							(b: any) => b.binId === item.binId
						);

						if (binEntry) {
							currentStock = binEntry.quantity || 0;
							lastUpdated = binEntry.lastUpdated;
						}
					}
				}

				return {
					item: item.stockItemName,
					bin: item.binName,
					ordered: item.orderedQuantity,
					received: item.receivedQuantity,
					unitPrice: item.unitPrice,
					totalPrice: item.totalPrice,
					currentStock,
					lastUpdated,
					shouldIncreaseBy: item.receivedQuantity,
					willBe: currentStock + item.receivedQuantity
				};
			} catch (error) {
				return {
					item: item.stockItemName,
					bin: item.binName,
					error: error instanceof Error ? error.message : 'Unknown error'
				};
			}
		})
	);

	return NextResponse.json({
		receipt: {
			id: receipt._id,
			number: receipt.receiptNumber,
			status: receipt.status,
			hasDocumentBin: !!receipt.documentBinId,
			documentBinName: receipt.documentBinName
		},
		items: receipt.receivedItems,
		stockChecks,
		summary: {
			totalItems: receipt.receivedItems.length,
			itemsWithQuantity: receipt.receivedItems.filter((item: any) => item.receivedQuantity > 0).length,
			itemsWithZeroQuantity: receipt.receivedItems.filter((item: any) => item.receivedQuantity === 0).length,
			totalOrdered: receipt.receivedItems.reduce((sum: number, item: any) => sum + (item.orderedQuantity || 0), 0),
			totalReceived: receipt.receivedItems.reduce((sum: number, item: any) => sum + (item.receivedQuantity || 0), 0),
			totalValue: receipt.receivedItems.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0)
		}
	});
}