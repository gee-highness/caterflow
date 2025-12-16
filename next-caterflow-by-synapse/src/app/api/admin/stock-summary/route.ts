import { NextResponse } from 'next/server';
import { client } from '@/lib/sanity';

export async function GET() {
	try {
		const summary = await client.fetch(`
            {
                "totalSnapshots": count(*[_type == "StockSnapshot"]),
                "totalBinStock": count(*[_type == "BinStock"]),
                "totalStockValue": *[_type == "BinStock"] {
                    quantity,
                    "unitPrice": stockItem->unitPrice
                } | {
                    "total": sum(quantity * unitPrice)
                }.total,
                "goodsReceipts": {
                    "total": count(*[_type == "GoodsReceipt"]),
                    "completed": count(*[_type == "GoodsReceipt" && status == "completed"]),
                    "pending": count(*[_type == "GoodsReceipt" && status != "completed"])
                },
                "recentReceipts": *[_type == "GoodsReceipt" && status == "completed"] | order(_createdAt desc) [0...5] {
                    receiptNumber,
                    _createdAt,
                    "itemCount": count(receivedItems)
                }
            }
        `);

		return NextResponse.json(summary);
	} catch (error: any) {
		return NextResponse.json(
			{ error: 'Failed to get summary', details: error.message },
			{ status: 500 }
		);
	}
}