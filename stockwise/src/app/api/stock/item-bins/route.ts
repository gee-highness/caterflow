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

		// Find all bins where this item has stock or transactions
		const query = groq`{
      // Get bins with stock snapshots
      "binsWithSnapshots": *[
        _type == "stockSnapshot" && 
        stockItem._ref == $stockItemId &&
        quantity > 0
      ].bin-> {
        _id,
        name,
        site->{
          _id,
          name
        },
        "stockQuantity": ^.quantity
      },
      
      // Get bins with recent transactions
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
    }`;

		const data = await client.fetch(query, { stockItemId });

		// Deduplicate bins
		const binMap = new Map();

		// Add bins with snapshots
		data.binsWithSnapshots?.forEach((bin: any) => {
			if (bin._id && !binMap.has(bin._id)) {
				binMap.set(bin._id, {
					...bin,
					hasStock: true
				});
			}
		});

		// Add bins with transactions
		data.binsWithTransactions?.forEach((tx: any) => {
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