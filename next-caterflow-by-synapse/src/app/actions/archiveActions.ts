'use server';

import { getArchivedTransactionsForItem, getLatestStockBaseline } from '@/lib/archiveQueries';

export async function fetchArchivedTransactions(itemId: string, binId: string) {
    return getArchivedTransactionsForItem(itemId, binId);
}

export async function fetchLatestStockBaseline() {
    return getLatestStockBaseline();
}
