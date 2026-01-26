import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { client, writeClient } from '@/lib/sanity';

export async function POST(request: Request) {
	try {
		const session = await getServerSession(authOptions);
		if (!session || session.user?.role !== 'admin') {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { password, batchSize = 20 } = await request.json();

		if (password !== process.env.ADMIN_RESET_PASSWORD) {
			return NextResponse.json({ error: 'Invalid password' }, { status: 403 });
		}

		// Get all completed goods receipts
		const receipts = await client.fetch(`
            *[_type == "GoodsReceipt" && status == "completed"] | order(_createdAt asc) [0...${batchSize}] {
                _id,
                receiptNumber,
                _createdAt,
                receivingBin->{_id},
                receivedItems[] {
                    stockItem->{_id},
                    receivedQuantity
                }
            }
        `);

		let itemsProcessed = 0;
		let binStocksCreated = 0;
		let snapshotsCreated = 0;

		// Process each receipt
		for (const receipt of receipts) {
			for (const item of receipt.receivedItems) {
				if (item.stockItem && item.receivedQuantity > 0 && receipt.receivingBin) {
					itemsProcessed++;

					// Check if BinStock exists
					const existingBinStock = await client.fetch(`
                        *[_type == "BinStock" && 
                          bin._ref == $binId && 
                          stockItem._ref == $itemId][0] { _id, quantity }
                    `, {
						binId: receipt.receivingBin._id,
						itemId: item.stockItem._id
					});

					if (existingBinStock) {
						// Update existing
						await writeClient
							.patch(existingBinStock._id)
							.inc({ quantity: item.receivedQuantity })
							.commit();
					} else {
						// Create new
						await writeClient.create({
							_type: 'BinStock',
							bin: { _type: 'reference', _ref: receipt.receivingBin._id },
							stockItem: { _type: 'reference', _ref: item.stockItem._id },
							quantity: item.receivedQuantity,
							lastUpdated: new Date().toISOString()
						});
						binStocksCreated++;
					}

					// Create StockSnapshot
					await writeClient.create({
						_type: 'StockSnapshot',
						transactionType: 'procurement',
						transaction: { _type: 'reference', _ref: receipt._id },
						stockItem: { _type: 'reference', _ref: item.stockItem._id },
						quantityChange: item.receivedQuantity,
						transactionDate: receipt._createdAt,
						notes: `Goods receipt: ${receipt.receiptNumber}`,
						bin: { _type: 'reference', _ref: receipt.receivingBin._id }
					});
					snapshotsCreated++;
				}
			}
		}

		return NextResponse.json({
			success: true,
			receiptsProcessed: receipts.length,
			itemsProcessed,
			binStocksCreated,
			snapshotsCreated,
			message: `Processed ${receipts.length} receipts successfully`
		});

	} catch (error: any) {
		console.error('Fix failed:', error);
		return NextResponse.json(
			{ error: 'Fix failed', details: error.message },
			{ status: 500 }
		);
	}
}