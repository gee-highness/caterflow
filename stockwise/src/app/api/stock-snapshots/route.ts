import { NextRequest, NextResponse } from 'next/server';
import { client, writeClient } from '@/lib/sanity';

export async function POST(request: NextRequest) {
	try {
		const { stockItemId, binId, quantity, transactionType, transactionId } = await request.json();

		if (!stockItemId || !binId) {
			return NextResponse.json(
				{ error: 'stockItemId and binId are required' },
				{ status: 400 }
			);
		}

		console.log('📝 Creating/updating stock snapshot:', {
			stockItemId,
			binId,
			quantity,
			transactionType,
			transactionId
		});

		// Check if snapshot exists
		const existingSnapshot = await client.fetch(
			`*[_type == "stockSnapshot" && stockItem._ref == $stockItemId && bin._ref == $binId][0]`,
			{ stockItemId, binId }
		);

		const now = new Date().toISOString();

		if (existingSnapshot) {
			// Update existing snapshot
			await writeClient
				.patch(existingSnapshot._id)
				.set({
					quantity,
					lastUpdated: now,
					transactionType,
					transactionId
				})
				.commit();

			console.log(`✅ Updated snapshot for ${stockItemId}-${binId}: ${quantity}`);
		} else {
			// Create new snapshot
			await writeClient.create({
				_type: 'stockSnapshot',
				stockItem: {
					_type: 'reference',
					_ref: stockItemId,
				},
				bin: {
					_type: 'reference',
					_ref: binId,
				},
				quantity,
				lastUpdated: now,
				transactionType,
				transactionId
			});

			console.log(`✅ Created snapshot for ${stockItemId}-${binId}: ${quantity}`);
		}

		return NextResponse.json(
			{
				success: true,
				message: existingSnapshot ? 'Snapshot updated' : 'Snapshot created',
				stockItemId,
				binId,
				quantity
			},
			{ status: 200 }
		);
	} catch (error: any) {
		console.error('Failed to update stock snapshot:', error);

		return NextResponse.json(
			{
				success: false,
				error: error.message || 'Failed to update stock snapshot'
			},
			{ status: 500 }
		);
	}
}