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

		const { password, batchSize = 50 } = await request.json();

		// Simple password check (use environment variable in production)
		if (password !== process.env.ADMIN_RESET_PASSWORD) {
			return NextResponse.json({ error: 'Invalid password' }, { status: 403 });
		}

		let snapshotsDeleted = 0;
		let batches = 0;

		// Delete StockSnapshots in batches
		while (true) {
			const snapshots = await client.fetch(
				`*[_type == "stockSnapshot"] | order(_createdAt asc) [0...${batchSize}] { _id }`
			);

			if (snapshots.length === 0) break;

			const transaction = writeClient.transaction();
			snapshots.forEach((s: { _id: string; }) => transaction.delete(s._id));
			await transaction.commit();

			snapshotsDeleted += snapshots.length;
			batches++;

			// Small delay to avoid rate limiting
			await new Promise(resolve => setTimeout(resolve, 500));
		}

		// Reset BinStock quantities
		const binStockCount = await client.fetch(`count(*[_type == "BinStock"])`);
		await writeClient
			.patch({ query: '*[_type == "BinStock"]' })
			.set({ quantity: 0 })
			.commit();

		return NextResponse.json({
			success: true,
			snapshotsDeleted,
			binStockReset: binStockCount,
			batchesProcessed: batches,
			message: 'Stock data cleared successfully'
		});

	} catch (error: any) {
		console.error('Reset failed:', error);
		return NextResponse.json(
			{ error: 'Reset failed', details: error.message },
			{ status: 500 }
		);
	}
}