// src/lib/cache.ts
import { LRUCache } from 'lru-cache';

// Types for our cache
export type StockDataCache = { [key: string]: number };

// Create LRU cache for stock data
const stockCache = new LRUCache<string, StockDataCache>({
	max: 100, // Maximum number of items
	ttl: 30000, // 30 seconds TTL
});

export const getCachedStock = (key: string): StockDataCache | undefined => {
	return stockCache.get(key);
};

export const setCachedStock = (key: string, value: StockDataCache): void => {
	stockCache.set(key, value);
};

export const clearStockCache = (): void => {
	stockCache.clear();
};

export const invalidateStockCache = (pattern: string): void => {
	const keys = Array.from(stockCache.keys());
	for (const key of keys) {
		if (key.includes(pattern)) {
			stockCache.delete(key);
		}
	}
};

// Additional helper functions
export const getCachedStockItem = (key: string, itemBinKey: string): number | undefined => {
	const cachedData = stockCache.get(key);
	return cachedData ? cachedData[itemBinKey] : undefined;
};

export const setCachedStockItem = (key: string, itemBinKey: string, value: number): void => {
	const cachedData = stockCache.get(key) || {};
	cachedData[itemBinKey] = value;
	stockCache.set(key, cachedData);
};