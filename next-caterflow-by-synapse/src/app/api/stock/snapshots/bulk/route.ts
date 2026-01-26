import { NextResponse } from 'next/server';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function POST(request: Request) {
	try {
		const { stockItemIds, binIds } = await request.json();

		if (!stockItemIds || !binIds || stockItemIds.length === 0 || binIds.length === 0) {
			return NextResponse.json({ error: 'Missing stockItemIds or binIds' }, { status: 400 });
		}

		console.log(`📊 Fetching ${stockItemIds.length} items × ${binIds.length} bins = ${stockItemIds.length * binIds.length} snapshots`);

		// Get ALL snapshots in one efficient query
		const query = groq`*[
      _type == "stockSnapshot" && 
      stockItem._ref in $stockItemIds && 
      bin._ref in $binIds
    ] {
      "itemId": stockItem._ref,
      "binId": bin._ref,
      quantity,
      lastUpdated
    }`;

		const snapshots = await client.fetch(query, { stockItemIds, binIds });

		// Convert to the format calculateBulkStock returns
		const results: { [key: string]: number } = {};
		const missingSnapshots: Array<{ itemId: string; binId: string }> = [];

		// Initialize all possible combinations as 0
		for (const binId of binIds) {
			for (const itemId of stockItemIds) {
				const key = `${itemId}-${binId}`;
				results[key] = 0; // Default
			}
		}

		// Fill in existing snapshots
		snapshots.forEach((snapshot: any) => {
			const key = `${snapshot.itemId}-${snapshot.binId}`;
			results[key] = snapshot.quantity || 0;
		});

		// Identify which are missing (value is still 0)
		for (const [key, value] of Object.entries(results)) {
			if (value === 0) {
				const [itemId, binId] = key.split('-');
				missingSnapshots.push({ itemId, binId });
			}
		}

		console.log(`✅ Found ${snapshots.length} snapshots, ${missingSnapshots.length} missing`);

		return NextResponse.json({
			snapshots: results,
			missingCount: missingSnapshots.length,
			totalCount: Object.keys(results).length,
			hasAllSnapshots: missingSnapshots.length === 0
		});

	} catch (error: any) {
		console.error('Error fetching bulk snapshots:', error);
		return NextResponse.json(
			{ error: 'Failed to fetch snapshots', details: error.message },
			{ status: 500 }
		);
	}
}