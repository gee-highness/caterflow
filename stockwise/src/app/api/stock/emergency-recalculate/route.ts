// /api/stock/emergency-recalculate/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { client, writeClient } from '@/lib/sanity';

export async function POST(request: Request) {
	try {
		const session = await getServerSession(authOptions);

		// Optional: Only allow admins or specific roles
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		console.log('🚨 Starting emergency stock recalculation via API...');

		// 1. Clear existing StockSnapshots
		let snapshotsDeleted = 0;
		while (true) {
			const snapshots = await client.fetch(
				`*[_type == "StockSnapshot"] | order(_createdAt asc) [0...50] { _id }`
			);

			if (snapshots.length === 0) break;

			const transaction = writeClient.transaction();
			snapshots.forEach((s: { _id: string; }) => transaction.delete(s._id));
			await transaction.commit();

			snapshotsDeleted += snapshots.length;
			await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
		}

		// 2. Reset BinStock quantities
		const binStockCount = await client.fetch(`count(*[_type == "BinStock"])`);
		await writeClient
			.patch({ query: '*[_type == "BinStock"]' })
			.set({ quantity: 0 })
			.commit();

		// 3. Process all completed goods receipts
		const receipts = await client.fetch(`
            *[_type == "GoodsReceipt" && status == "completed"] {
                _id,
                receiptNumber,
                receivingBin->{_id},
                receivedItems[] {
                    stockItem->{_id},
                    receivedQuantity
                }
            }
        `);

		let receiptsProcessed = 0;
		let itemsProcessed = 0;

		for (const receipt of receipts) {
			for (const item of receipt.receivedItems) {
				if (item.stockItem && item.receivedQuantity > 0 && receipt.receivingBin) {
					itemsProcessed++;

					// Update or create BinStock
					const existingBinStock = await client.fetch(`
                        *[_type == "BinStock" && 
                          bin._ref == $binId && 
                          stockItem._ref == $itemId][0] { _id }
                    `, {
						binId: receipt.receivingBin._id,
						itemId: item.stockItem._id
					});

					if (existingBinStock) {
						await writeClient
							.patch(existingBinStock._id)
							.inc({ quantity: item.receivedQuantity })
							.commit();
					} else {
						await writeClient.create({
							_type: 'BinStock',
							bin: { _type: 'reference', _ref: receipt.receivingBin._id },
							stockItem: { _type: 'reference', _ref: item.stockItem._id },
							quantity: item.receivedQuantity,
							lastUpdated: new Date().toISOString()
						});
					}

					// Create StockSnapshot
					await writeClient.create({
						_type: 'StockSnapshot',
						transactionType: 'procurement',
						transaction: { _type: 'reference', _ref: receipt._id },
						stockItem: { _type: 'reference', _ref: item.stockItem._id },
						quantityChange: item.receivedQuantity,
						transactionDate: new Date().toISOString(),
						notes: `Emergency recalc: ${receipt.receiptNumber}`
					});
				}
			}
			receiptsProcessed++;
		}

		return NextResponse.json({
			success: true,
			message: 'Emergency recalculation complete',
			stats: {
				snapshotsDeleted,
				binStockReset: binStockCount,
				receiptsProcessed,
				itemsProcessed
			},
			timestamp: new Date().toISOString()
		});

	} catch (error: any) {
		console.error('Emergency recalculation failed:', error);
		return NextResponse.json(
			{ error: 'Emergency recalculation failed', details: error.message },
			{ status: 500 }
		);
	}
}