// /api/stock/update/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { updateStockForTransaction } from '@/lib/stockCalculations';

export async function POST(request: Request) {
	try {
		const session = await getServerSession(authOptions);
		if (!session?.user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { transactionType, transactionId } = await request.json();

		// Now this runs on the server with proper write permissions
		await updateStockForTransaction(transactionType, transactionId);

		return NextResponse.json({
			success: true,
			message: `Stock updated for ${transactionType}: ${transactionId}`
		});
	} catch (error: any) {
		console.error('API: Failed to update stock:', error);
		return NextResponse.json(
			{ error: 'Failed to update stock', details: error.message },
			{ status: 500 }
		);
	}
}