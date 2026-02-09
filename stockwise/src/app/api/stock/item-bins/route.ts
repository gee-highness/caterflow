import { NextRequest, NextResponse } from 'next/server';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function GET(request: NextRequest) {
	try {
		const searchParams = request.nextUrl.searchParams;
		const stockItemId = searchParams.get('stockItemId');

		if (!stockItemId) {
			return NextResponse.json(
				{ error: 'Missing stockItemId' },
				{ status: 400 }
			);
		}

		// Get from registry document
		const query = groq`*[_type == "stockRegistry"][0] {
            stockData.items[stockItemId == $stockItemId] {
                stockItemId,
                binQuantities.bins[] {
                    binId,
                    quantity,
                    lastUpdated
                }
            }
        }`;

		const data = await client.fetch(query, { stockItemId });
		const itemData = data?.stockData?.items?.[0];

		// Get bins with stock from registry
		const binsWithStock = itemData?.binQuantities?.bins
			?.filter((bin: any) => bin.quantity > 0)
			.map((bin: any) => ({
				_id: bin.binId,
				name: `Bin ${bin.binId.slice(0, 8)}...`, // You might want to fetch actual bin names
				stockQuantity: bin.quantity
			})) || [];

		// Also get bins with transactions (from other queries)
		const binsWithTransactions = await client.fetch(groq`{
            "binsWithTransactions": *[
                _type in ["GoodsReceipt", "DispatchLog", "InternalTransfer", "InventoryCount"] &&
                (
                    (_type == "GoodsReceipt" && receivingBin._ref != null) ||
                    (_type == "DispatchLog" && sourceBin._ref != null) ||
                    (_type == "InternalTransfer" && (fromBin._ref != null || toBin._ref != null)) ||
                    (_type == "InventoryCount" && bin._ref != null)
                )
            ] {
                "binId": coalesce(receivingBin._ref, sourceBin._ref, bin._ref),
                "type": _type
            }
        }`, { stockItemId });

		// Deduplicate bins
		const binMap = new Map();

		// Add bins with stock from registry
		binsWithStock.forEach((bin: any) => {
			if (bin._id && !binMap.has(bin._id)) {
				binMap.set(bin._id, {
					...bin,
					hasStock: true
				});
			}
		});

		// Add bins with transactions
		binsWithTransactions?.binsWithTransactions?.forEach((tx: any) => {
			if (tx.binId && !binMap.has(tx.binId)) {
				binMap.set(tx.binId, {
					_id: tx.binId,
					name: `Bin ${tx.binId.slice(0, 8)}...`,
					hasTransactions: true
				});
			}
		});

		const bins = Array.from(binMap.values());

		return NextResponse.json({
			success: true,
			itemId: stockItemId,
			bins: bins,
			totalBins: bins.length
		});

	} catch (error: any) {
		console.error('Error fetching item bins:', error);
		return NextResponse.json(
			{
				error: error.message || 'Failed to fetch item bins',
				success: false
			},
			{ status: 500 }
		);
	}
}