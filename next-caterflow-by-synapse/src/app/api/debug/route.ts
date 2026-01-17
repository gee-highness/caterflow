// src/app/api/debug/receipt-bins/route.ts
import { NextResponse } from 'next/server';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function GET() {
	try {
		const receipts = await client.fetch(groq`*[_type == "GoodsReceipt" && status == "completed"] | order(receiptDate desc)[0..10]{
      receiptNumber,
      status,
      "hasDocumentBin": defined(receivingBin._ref),
      "documentBinName": receivingBin->name,
      "itemCount": count(receivedItems),
      "itemsWithBins": count(receivedItems[defined(receivingBin._ref)]),
      "receivedItems": receivedItems[]{
        stockItem->name,
        receivedQuantity,
        "hasBin": defined(receivingBin._ref),
        "binName": receivingBin->name
      }
    }`);

		return NextResponse.json({
			sampleSize: receipts.length,
			receipts,
			summary: {
				totalReceipts: receipts.length,
				withDocumentBin: receipts.filter((r: any) => r.hasDocumentBin).length,
				itemsWithBins: receipts.reduce((sum: number, r: any) => sum + r.itemsWithBins, 0),
				totalItems: receipts.reduce((sum: number, r: any) => sum + r.itemCount, 0),
				percentWithBins: receipts.length > 0 ?
					(receipts.reduce((sum: number, r: any) => sum + r.itemsWithBins, 0) /
						receipts.reduce((sum: number, r: any) => sum + r.itemCount, 0) * 100).toFixed(1) : '0.0'
			}
		});
	} catch (error) {
		console.error('Error fetching receipt data:', error);
		return NextResponse.json({ error: 'Failed to fetch receipt data' }, { status: 500 });
	}
}