import { NextRequest, NextResponse } from 'next/server';
import { auditStockCalculations } from '@/lib/stockCalculations';

export async function GET(request: NextRequest) {
	try {
		const searchParams = request.nextUrl.searchParams;
		const stockItemId = searchParams.get('stockItemId');
		const binId = searchParams.get('binId');

		if (!stockItemId || !binId) {
			return NextResponse.json(
				{ error: 'Missing stockItemId or binId' },
				{ status: 400 }
			);
		}

		const auditResult = await auditStockCalculations(stockItemId, binId);

		return NextResponse.json(auditResult);
	} catch (error: any) {
		console.error('Error in stock audit API:', error);
		return NextResponse.json(
			{ error: error.message || 'Failed to audit stock calculations' },
			{ status: 500 }
		);
	}
}