// src/app/api/stock/clear-snapshots/route.ts
import { NextResponse } from 'next/server';
import { client, writeClient } from '@/lib/sanity';

export async function POST(request: Request) {
	try {
		console.log('🧹 Starting stock snapshots clearance...');

		// 1. Fetch all StockSnapshot documents
		const snapshots = await client.fetch(`
            *[_type == "StockSnapshot"] {
                _id,
                stockItem->{name, sku},
                bin->{name}
            }
        `);

		console.log(`📊 Found ${snapshots.length} stock snapshots to clear`);

		// 2. Delete all snapshots if any exist
		if (snapshots.length > 0) {
			// Delete in one transaction (Sanity can handle up to 1000 mutations)
			const transaction = writeClient.transaction();

			snapshots.forEach((snapshot: any) => {
				transaction.delete(snapshot._id);
			});

			await transaction.commit();
			console.log(`✅ Deleted ${snapshots.length} stock snapshots`);
		}

		// 3. NO CACHE DOCUMENT NEEDED - Just return success

		return NextResponse.json({
			success: true,
			message: `Successfully cleared ${snapshots.length} stock snapshots`,
			snapshotsCleared: snapshots.length
		});

	} catch (error: any) {
		console.error('❌ Failed to clear snapshots:', error);
		return NextResponse.json(
			{
				error: 'Failed to clear stock snapshots',
				details: error.message
			},
			{ status: 500 }
		);
	}
}

// Optional: Simple GET to check snapshot count
export async function GET() {
	try {
		const snapshotCount = await client.fetch(`count(*[_type == "StockSnapshot"])`);
		return NextResponse.json({
			snapshotCount,
			hasSnapshots: snapshotCount > 0
		});
	} catch (error) {
		return NextResponse.json(
			{ error: 'Failed to get snapshot count' },
			{ status: 500 }
		);
	}
}