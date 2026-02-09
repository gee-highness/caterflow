// src/app/api/admin/stock-summary/route.ts
import { NextResponse } from 'next/server';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function GET() {
    try {
        const query = groq`{
			// Legacy stats
			"totalSnapshots": count(*[_type == "stockSnapshot"]),
			"totalBinStock": count(*[_type == "BinStock"]),
			
			// New registry stats
			"registry": *[_type == "stockRegistry"][0] {
				_id,
				title,
				lastUpdated,
				version,
				"itemCount": count(stockData.items),
				"totalEntries": count(stockData.items[].binQuantities.bins[])
			},
			
			// Transaction counts
			"goodsReceipts": count(*[_type == "GoodsReceipt"]),
			"dispatches": count(*[_type == "DispatchLog"]),
			"transfers": count(*[_type == "InternalTransfer"]),
			"inventoryCounts": count(*[_type == "InventoryCount"]),
			
			// Basic counts
			"stockItems": count(*[_type == "StockItem"]),
			"bins": count(*[_type == "Bin"])
		}`;

        const data = await client.fetch(query);

        return NextResponse.json({
            summary: {
                timestamp: new Date().toISOString(),
                usingNewSystem: !!data.registry,
                legacy: {
                    snapshots: data.totalSnapshots,
                    binStock: data.totalBinStock
                },
                registry: data.registry || {
                    message: 'No registry found - using legacy system'
                },
                transactions: {
                    goodsReceipts: data.goodsReceipts,
                    dispatches: data.dispatches,
                    transfers: data.transfers,
                    inventoryCounts: data.inventoryCounts
                },
                entities: {
                    stockItems: data.stockItems,
                    bins: data.bins
                }
            }
        });

    } catch (error: any) {
        console.error('Failed to get stock summary:', error);
        return NextResponse.json(
            { error: 'Failed to get stock summary', details: error.message },
            { status: 500 }
        );
    }
}