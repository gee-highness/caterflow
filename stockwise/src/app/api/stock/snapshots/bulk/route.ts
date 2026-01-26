import { NextResponse } from 'next/server';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function POST(request: Request) {
	try {
		const { stockItemIds, binIds } = await request.json();

		if (!stockItemIds || !binIds || stockItemIds.length === 0 || binIds.length === 0) {
			return NextResponse.json({
				error: 'Missing stockItemIds or binIds'
			}, { status: 400 });
		}

		console.log(`📊 API: Requested ${stockItemIds.length} items, ${binIds.length} bins`);

		// SAFETY CHECK: Limit the number of combinations
		const totalCombinations = stockItemIds.length * binIds.length;
		if (totalCombinations > 5000) {
			console.warn(`⚠️ WARNING: Too many combinations requested (${totalCombinations}), limiting`);
			return NextResponse.json({
				error: 'Too many combinations requested',
				maxAllowed: 5000,
				requested: totalCombinations
			}, { status: 400 });
		}

		// Get snapshots ONLY for requested bins/items
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

		// Create results object with ALL requested combinations
		const results: { [key: string]: number } = {};

		// Initialize ALL requested combinations to 0 (missing)
		for (const binId of binIds) {
			for (const itemId of stockItemIds) {
				const key = `${itemId}-${binId}`;
				results[key] = 0;
			}
		}

		// Fill in existing snapshots
		snapshots.forEach((snapshot: any) => {
			const key = `${snapshot.itemId}-${snapshot.binId}`;
			// Only set if this combination was requested
			if (results[key] !== undefined) {
				results[key] = snapshot.quantity || 0;
			}
		});

		// Count how many are still 0 (missing)
		let missingCount = 0;
		Object.values(results).forEach(value => {
			if (value === 0) missingCount++;
		});

		const totalCount = Object.keys(results).length;
		const hasAllSnapshots = missingCount === 0;

		console.log(`✅ API: ${snapshots.length} snapshots found, ${missingCount} missing of ${totalCount} requested`);

		return NextResponse.json({
			snapshots: results,
			missingCount,
			totalCount,
			hasAllSnapshots,
			existingSnapshots: snapshots.length
		});

	} catch (error: any) {
		console.error('❌ Error in bulk snapshots API:', error);
		return NextResponse.json({
			error: 'Failed to fetch snapshots',
			details: error.message
		}, { status: 500 });
	}
}