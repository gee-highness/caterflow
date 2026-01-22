// src/app/api/stock/snapshots/route.ts
import { NextResponse } from 'next/server';
import { getCurrentStockSnapshots, compareSnapshotsWithCalculated } from '@/lib/stockCalculations';

export async function POST(request: Request) {
	try {
		const { stockItemIds, binIds, compare = false } = await request.json();

		if (compare) {
			if (!stockItemIds || !binIds) {
				return NextResponse.json(
					{ error: 'Both stockItemIds and binIds are required for comparison' },
					{ status: 400 }
				);
			}

			const comparison = await compareSnapshotsWithCalculated(stockItemIds, binIds);
			return NextResponse.json(comparison);
		}

		const snapshots = await getCurrentStockSnapshots(stockItemIds, binIds);
		return NextResponse.json(snapshots);

	} catch (error: any) {
		console.error('API Error fetching snapshots:', error);
		return NextResponse.json(
			{ error: error.message },
			{ status: 500 }
		);
	}
}

export async function GET(request: Request) {
	try {
		const snapshots = await getCurrentStockSnapshots();
		return NextResponse.json(snapshots);
	} catch (error: any) {
		return NextResponse.json(
			{ error: error.message },
			{ status: 500 }
		);
	}
}