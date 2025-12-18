// src/lib/stockCalculations.ts - UX-OPTIMIZED VERSION (V2: WITH CONCURRENCY FIXES)
import { client, writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';
import Decimal from 'decimal.js';
import {
  getCachedStock,
  setCachedStock,
  getCachedStockItem,
  setCachedStockItem,
  invalidateStockCache,
  type StockDataCache
} from '@/lib/cache';

// Add at the top of the file, after imports:
import { Mutex } from 'async-mutex';

Decimal.set({ precision: 10, rounding: Decimal.ROUND_HALF_UP });

// Replace the old mutex system with a new one that prevents timer conflicts
class StockCalculationManager {
  private static instance: StockCalculationManager;
  private calculationLocks = new Map<string, boolean>();
  private activeTimers = new Map<string, number>();
  private calculationQueue = new Map<string, Array<() => void>>();

  private constructor() { }

  static getInstance(): StockCalculationManager {
    if (!StockCalculationManager.instance) {
      StockCalculationManager.instance = new StockCalculationManager();
    }
    return StockCalculationManager.instance;
  }

  async acquireCalculationLock(key: string): Promise<() => void> {
    // If calculation is already in progress, queue this request
    if (this.calculationLocks.has(key)) {
      return new Promise((resolve) => {
        if (!this.calculationQueue.has(key)) {
          this.calculationQueue.set(key, []);
        }
        // Push a function that will resolve with the release function
        this.calculationQueue.get(key)!.push(async () => {
          const release = await this.acquireCalculationLock(key);
          resolve(release);
        });
      });
    }

    this.calculationLocks.set(key, true);
    return () => this.releaseCalculationLock(key);
  }

  private releaseCalculationLock(key: string): void {
    this.calculationLocks.delete(key);

    // Process next request in queue if any
    const queue = this.calculationQueue.get(key);
    if (queue && queue.length > 0) {
      const nextCallback = queue.shift()!;
      setTimeout(nextCallback, 0); // Process next in queue asynchronously
    }
  }

  startTimer(key: string): void {
    const timerId = Date.now();
    this.activeTimers.set(key, timerId);
    console.time(key);
  }

  endTimer(key: string): boolean {
    const timerId = this.activeTimers.get(key);
    if (timerId) {
      console.timeEnd(key);
      this.activeTimers.delete(key);
      return true;
    }
    return false;
  }

  hasActiveTimer(key: string): boolean {
    return this.activeTimers.has(key);
  }

  clearAllTimers(): void {
    this.activeTimers.clear();
  }

  // Expose lock state for getActiveCalculations
  getLockKeys(): string[] {
    return Array.from(this.calculationLocks.keys());
  }
}

// Global instance
const calculationManager = StockCalculationManager.getInstance();

// Create a mutex for stock updates (keep existing for write operations)
const stockUpdateMutexes = new Map<string, Mutex>();

const getMutexForKey = (key: string): Mutex => {
  if (!stockUpdateMutexes.has(key)) {
    stockUpdateMutexes.set(key, new Mutex());
  }
  return stockUpdateMutexes.get(key)!;
};

// Clean up old mutexes periodically
setInterval(() => {
  // Remove mutexes older than 1 hour
  // (In a real app, you'd track usage)
}, 3600000);
// ========== UX ENHANCEMENTS & METRICS ==========

interface CalculationMetrics {
  timestamp: number;
  duration: number;
  cacheHit: boolean;
  itemsProcessed: number;
  fromCache: number;
  calculated: number;
  error?: string;
}

// Store recent calculation metrics for performance insights
const recentMetrics: CalculationMetrics[] = [];
const MAX_METRICS_HISTORY = 100;

// Track performance for user feedback
const trackMetric = (metric: CalculationMetrics) => {
  recentMetrics.unshift(metric);
  if (recentMetrics.length > MAX_METRICS_HISTORY) {
    recentMetrics.pop();
  }
};

// Get average calculation time for user feedback
export const getPerformanceStats = () => {
  if (recentMetrics.length === 0) return null;

  const avgDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
  const cacheHitRate = (recentMetrics.filter(m => m.cacheHit).length / recentMetrics.length) * 100;

  return {
    avgDuration: Math.round(avgDuration),
    cacheHitRate: Math.round(cacheHitRate),
    totalCalculations: recentMetrics.length,
    lastCalculation: recentMetrics[0]?.timestamp || null
  };
};

// ========== ENHANCED CACHE MANAGEMENT ==========

// Replace the existing snapshotCache with a better implementation
class OptimizedSnapshotCache {
  private cache = new Map<string, {
    quantity: number;
    timestamp: number;
    metadata?: {
      confidence?: 'high' | 'medium' | 'low';
      transactionCount?: number;
    };
  }>();
  private readonly MAX_SIZE = 1000;
  private readonly TTL = 30000; // 30 seconds
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000); // Clean up every minute
  }

  private cleanupExpired(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.TTL) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
    }
  }

  get(key: string): { quantity: number; timestamp: number; metadata?: any } | undefined {
    const cached = this.cache.get(key);
    if (!cached) return undefined;

    // Check TTL
    if (Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(key);
      return undefined;
    }

    return cached;
  }

  set(key: string, quantity: number, metadata?: any): void {
    // Clean up if cache is too large (simple LIFO eviction)
    if (this.cache.size >= this.MAX_SIZE) {
      const oldestKey = Array.from(this.cache.keys())[0];
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      quantity,
      timestamp: Date.now(),
      metadata
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Replace the old snapshotCache with the new class
const snapshotCache = new OptimizedSnapshotCache();

// Replace the old cleanupSnapshotCache function
const cleanupSnapshotCache = () => {
  // The OptimizedSnapshotCache class handles its own cleanup
  // We keep the setInterval but simplify the function to only log cache size
  console.log(`📊 Snapshot cache size: ${snapshotCache.size()}`);
};

// Run cleanup every minute (now only logs size)
setInterval(cleanupSnapshotCache, 60000);

// ========== PRIVATE HELPER FUNCTIONS ==========

// Get or create stock snapshot with enhanced caching
const getStockSnapshot = async (stockItemId: string, binId: string): Promise<number> => {
  const cacheKey = `${stockItemId}-${binId}`;

  // Check cache first
  const cached = snapshotCache.get(cacheKey);
  if (cached) {
    // If confidence is low, refresh in background
    if (cached.metadata?.confidence === 'low') {
      setTimeout(() => {
        refreshStockSnapshot(stockItemId, binId).catch(console.error);
      }, 0);
    }
    return cached.quantity;
  }

  try {
    const query = groq`*[_type == "stockSnapshot" && stockItem._ref == $stockItemId && bin._ref == $binId][0]{
      quantity,
      lastUpdated,
      "transactionCount": count(*[_type in ["GoodsReceipt", "DispatchLog", "InternalTransfer", "InventoryCount"] && 
        (stockItem._ref == $stockItemId && bin._ref == $binId)])
    }`;

    const snapshot = await client.fetch(query, { stockItemId, binId });

    if (snapshot) {
      const quantity = snapshot.quantity || 0;
      const confidence = snapshot.transactionCount > 10 ? 'high' :
        snapshot.transactionCount > 0 ? 'medium' : 'low';

      await atomicCacheUpdate(cacheKey, quantity, { confidence, transactionCount: snapshot.transactionCount });
      return quantity;
    }

    // No snapshot exists - calculate from transactions
    const calculatedStock = await calculateStockFromTransactions(stockItemId, binId, false);
    snapshotCache.set(cacheKey, calculatedStock, { confidence: 'low' });
    return calculatedStock;

  } catch (error) {
    console.error('Error getting stock snapshot:', error);

    // Try to get any cached value (even if we didn't find it earlier)
    const fallbackCache = snapshotCache.get(cacheKey);
    if (fallbackCache) {
      // Mark as low confidence due to error
      snapshotCache.set(cacheKey, fallbackCache.quantity, { confidence: 'low' });
      return fallbackCache.quantity;
    }

    return 0;
  }
};

// Calculate stock from transactions (for initial snapshot or validation)
// Calculate stock from transactions (for initial snapshot or validation)
// Calculate stock from transactions (for initial snapshot or validation)
const calculateStockFromTransactions = async (
  stockItemId: string,
  binId: string,
  verbose: boolean = true,
  asOfDate?: Date
): Promise<number> => {
  const startTime = Date.now();

  if (verbose) {
    const dateStr = asOfDate ? ` as of ${asOfDate.toISOString().split('T')[0]}` : '';
    console.log(`🧮 Calculating stock for ${stockItemId} in ${binId}${dateStr} from transactions`);
  }

  try {
    const dateFilter = asOfDate ? `&& date <= $asOfDate` : '';
    const asOfDateStr = asOfDate?.toISOString();

    const query = groq`{
      "allEvents": *[_type in ["GoodsReceipt", "DispatchLog", "InternalTransfer", "InventoryCount"] && 
        ((_type == "GoodsReceipt" && receivingBin._ref == $binId && status in ["completed", "processed"]) ||
         (_type == "DispatchLog" && sourceBin._ref == $binId && status in ["completed", "processed"]) ||
         (_type == "InternalTransfer" && status == "completed" && (fromBin._ref == $binId || toBin._ref == $binId)) ||
         (_type == "InventoryCount" && bin._ref == $binId && status == "completed"))
        ${dateFilter}
      ] | order(date asc) {
        _type,
        "date": coalesce(receiptDate, dispatchDate, transferDate, countDate),
        receivedItems[] {
          "itemId": stockItem._ref,
          "quantity": receivedQuantity
        },
        dispatchedItems[] {
          "itemId": stockItem._ref,
          "quantity": dispatchedQuantity
        },
        transferredItems[] {
          "itemId": stockItem._ref,
          "quantity": transferredQuantity,
          "fromBinId": ^.fromBin._ref,
          "toBinId": ^.toBin._ref
        },
        countedItems[] {
          "itemId": stockItem._ref,
          "quantity": countedQuantity
        }
      }
    }`;

    const data = await client.fetch(query, {
      binId,
      stockItemId,
      asOfDate: asOfDateStr
    });

    let stock = new Decimal(0);
    let lastCountDate: Date | null = null;

    // Process events in chronological order
    data.allEvents?.forEach((event: any) => {
      const eventDate = event.date ? new Date(event.date) : null;

      // Check if we should skip this event
      if (lastCountDate && eventDate && eventDate < lastCountDate) {
        return;
      }

      // Process goods receipts
      event.receivedItems?.forEach((item: any) => {
        if (item.itemId === stockItemId) {
          stock = stock.plus(item.quantity || 0);
        }
      });

      // Process dispatches
      event.dispatchedItems?.forEach((item: any) => {
        if (item.itemId === stockItemId) {
          stock = Decimal.max(0, stock.minus(item.quantity || 0));
        }
      });

      // Process transfers
      event.transferredItems?.forEach((item: any) => {
        if (item.itemId === stockItemId) {
          // Transfer OUT from this bin
          if (event.fromBinId === binId) {
            stock = Decimal.max(0, stock.minus(item.quantity || 0));
          }
          // Transfer IN to this bin
          if (event.toBinId === binId) {
            stock = stock.plus(item.quantity || 0);
          }
        }
      });

      // Process inventory counts
      event.countedItems?.forEach((item: any) => {
        if (item.itemId === stockItemId) {
          stock = new Decimal(item.quantity || 0);
          if (eventDate) {
            lastCountDate = eventDate;
          }
        }
      });
    });

    const duration = Date.now() - startTime;


    if (verbose) {
      console.log(`✅ Calculated stock for ${stockItemId} in ${binId}: ${stock.toNumber()} (${duration}ms)`);

      // ✅ FIX: Use explicit null/undefined check and a local variable 
      // to ensure the compiler treats it as a Date object.
      if (lastCountDate !== null && lastCountDate !== undefined) {
        const date: Date = lastCountDate;

        if (!isNaN(date.getTime())) {
          console.log(`   📅 Last inventory count: ${date.toISOString().split('T')[0]}`);
        }
      }
    }

    return stock.toNumber();

  } catch (error) {
    console.error('Error calculating stock from transactions:', error);
    return 0;
  }
};

// Update stock snapshot (internal use)
const updateStockSnapshot = async (
  stockItemId: string,
  binId: string,
  quantity: number,
  transactionType: string,
  transactionId: string | null
): Promise<void> => {
  const startTime = Date.now();

  try {
    // Optimistic update to cache for immediate UI feedback
    const cacheKey = `${stockItemId}-${binId}`;
    // Use new snapshotCache.set signature
    await atomicCacheUpdate(cacheKey, quantity, { confidence: 'high' });

    // Invalidate bulk cache patterns for this item/bin
    invalidateStockCache(stockItemId);
    invalidateStockCache(binId);

    // Check if snapshot exists
    const existingSnapshot = await client.fetch(
      groq`*[_type == "stockSnapshot" && stockItem._ref == $stockItemId && bin._ref == $binId][0]`,
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
          transactionId,
          updatedBy: transactionId // Track which transaction caused update
        })
        .commit();
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
        transactionId,
        createdAt: now,
        updatedBy: transactionId
      });
    }

    const duration = Date.now() - startTime;
    console.log(`📝 ${existingSnapshot?._id ? 'Updated' : 'Created'} snapshot for ${stockItemId}-${binId}: ${quantity} (${duration}ms)`);

  } catch (error) {
    console.error('Error updating stock snapshot:', error);

    // Revert optimistic update on error
    const cacheKey = `${stockItemId}-${binId}`;
    snapshotCache.delete(cacheKey);

    throw error;
  }
};

// Helper function to calculate stock for multiple items in one bin
// Helper function to calculate stock for multiple items in one bin
const calculateStockForBin = async (
  binId: string,
  itemIds: string[],
  onProgress?: (progress: number) => void
): Promise<{ [key: string]: number }> => {
  const startTime = Date.now();

  // Use calculation manager to prevent duplicate calculations
  const lockKey = `bin-calculation-${binId}`;
  const releaseLock = await calculationManager.acquireCalculationLock(lockKey);

  try {
    const timerKey = `📥 Fetching transactions for bin ${binId}`;
    // Use manager to check/start timer
    if (!calculationManager.hasActiveTimer(timerKey)) {
      calculationManager.startTimer(timerKey);
    }

    const transactionQuery = groq`{
      "goodsReceipts": *[
        _type == "GoodsReceipt" && 
        receivingBin._ref == $binId &&
        status in ["completed", "processed"]
      ] | order(receiptDate asc) {
        receiptDate,
        receivedItems[] {
          "itemId": stockItem._ref,
          receivedQuantity
        }
      },
      
      "dispatches": *[
        _type == "DispatchLog" && 
        sourceBin._ref == $binId &&
        status in ["completed", "processed"]
      ] | order(dispatchDate asc) {
        dispatchDate,
        dispatchedItems[] {
          "itemId": stockItem._ref,
          dispatchedQuantity
        }
      },
      
      "transfersOut": *[
        _type == "InternalTransfer" && 
        status == "completed" && 
        fromBin._ref == $binId
      ] | order(transferDate asc) {
        transferDate,
        transferredItems[] {
          "itemId": stockItem._ref,
          transferredQuantity
        }
      },
      
      "transfersIn": *[
        _type == "InternalTransfer" && 
        status == "completed" && 
        toBin._ref == $binId
      ] | order(transferDate asc) {
        transferDate,
        transferredItems[] {
          "itemId": stockItem._ref,
          transferredQuantity
        }
      },
      
      "inventoryCounts": *[
        _type == "InventoryCount" && 
        bin._ref == $binId &&
        status == "completed"
      ] | order(countDate asc) { 
        countDate,
        countedItems[] {
          "itemId": stockItem._ref,
          countedQuantity
        }
      },
      
      // Get item names for better logging
      "itemDetails": *[_type == "StockItem" && _id in $itemIds]{
        _id,
        name,
        sku
      }
    }`;

    const data = await client.fetch(transactionQuery, { binId, itemIds });

    calculationManager.endTimer(timerKey); // End timer if we started it

    // Initialize results with Decimals
    const results: { [key: string]: Decimal } = {};
    const itemMap = new Map<string, string>();

    data.itemDetails?.forEach((item: any) => {
      itemMap.set(item._id, item.name || item.sku || item._id);
    });

    itemIds.forEach(itemId => {
      results[`${itemId}-${binId}`] = new Decimal(0);
    });

    // Progress tracking
    let processedItems = 0;
    const totalItems = itemIds.length * 5; // 4 transaction types + inventory counts

    // Process all transactions efficiently
    const processTimerKey = `⚡ Processing transactions for bin ${binId}`;
    if (!calculationManager.hasActiveTimer(processTimerKey)) {
      calculationManager.startTimer(processTimerKey);
    }

    // Helper function to update progress
    const updateProgress = () => {
      processedItems++;
      if (onProgress && totalItems > 0) {
        onProgress(Math.min(100, Math.round((processedItems / totalItems) * 100)));
      }
    };

    // Process goods receipts
    data.goodsReceipts?.forEach((receipt: any) => {
      receipt.receivedItems?.forEach((item: any) => {
        if (item.itemId && itemIds.includes(item.itemId)) {
          const key = `${item.itemId}-${binId}`;
          results[key] = results[key].plus(item.receivedQuantity || 0);
          updateProgress();
        }
      });
    });

    // Process transfers out
    data.transfersOut?.forEach((transfer: any) => {
      transfer.transferredItems?.forEach((item: any) => {
        if (item.itemId && itemIds.includes(item.itemId)) {
          const key = `${item.itemId}-${binId}`;
          const transferQty = new Decimal(item.transferredQuantity || 0);
          // Prevent negative stock
          if (results[key].greaterThanOrEqualTo(transferQty)) {
            results[key] = results[key].minus(transferQty);
          } else {
            results[key] = new Decimal(0);
          }
          updateProgress();
        }
      });
    });

    // Process transfers in
    data.transfersIn?.forEach((transfer: any) => {
      transfer.transferredItems?.forEach((item: any) => {
        if (item.itemId && itemIds.includes(item.itemId)) {
          const key = `${item.itemId}-${binId}`;
          results[key] = results[key].plus(item.transferredQuantity || 0);
          updateProgress();
        }
      });
    });

    // **CRITICAL FIX: Process ALL transactions chronologically for each item**
    // This ensures inventory counts work correctly AND items not in counts keep their value

    // **FIXED: Process ALL transactions chronologically with proper inventory count logic**
    itemIds.forEach(itemId => {
      const key = `${itemId}-${binId}`;

      // Collect ALL transactions for this item
      const itemTransactions: Array<{
        date: Date;
        type: 'receipt' | 'dispatch' | 'transferOut' | 'transferIn' | 'count';
        quantity: Decimal;
      }> = [];

      // Add goods receipts
      data.goodsReceipts?.forEach((receipt: any) => {
        receipt.receivedItems?.forEach((item: any) => {
          if (item.itemId === itemId) {
            itemTransactions.push({
              date: new Date(receipt.receiptDate),
              type: 'receipt',
              quantity: new Decimal(item.receivedQuantity || 0)
            });
          }
        });
      });

      // Add dispatches
      data.dispatches?.forEach((dispatch: any) => {
        dispatch.dispatchedItems?.forEach((item: any) => {
          if (item.itemId === itemId) {
            itemTransactions.push({
              date: new Date(dispatch.dispatchDate),
              type: 'dispatch',
              quantity: new Decimal(item.dispatchedQuantity || 0)
            });
          }
        });
      });

      // Add transfers out
      data.transfersOut?.forEach((transfer: any) => {
        transfer.transferredItems?.forEach((item: any) => {
          if (item.itemId === itemId) {
            itemTransactions.push({
              date: new Date(transfer.transferDate),
              type: 'transferOut',
              quantity: new Decimal(item.transferredQuantity || 0)
            });
          }
        });
      });

      // Add transfers in
      data.transfersIn?.forEach((transfer: any) => {
        transfer.transferredItems?.forEach((item: any) => {
          if (item.itemId === itemId) {
            itemTransactions.push({
              date: new Date(transfer.transferDate),
              type: 'transferIn',
              quantity: new Decimal(item.transferredQuantity || 0)
            });
          }
        });
      });

      // Add inventory counts - ONLY if this item was counted
      data.inventoryCounts?.forEach((count: any) => {
        count.countedItems?.forEach((item: any) => {
          if (item.itemId === itemId) {
            itemTransactions.push({
              date: new Date(count.countDate),
              type: 'count',
              quantity: new Decimal(item.countedQuantity || 0)
            });
          }
        });
      });

      // Sort ALL transactions chronologically
      itemTransactions.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Process in chronological order with FIXED inventory count logic
      let currentStock = new Decimal(0);
      const countTimeline: Array<{ date: Date; quantity: Decimal }> = [];

      // First pass: collect all inventory counts
      itemTransactions.forEach(tx => {
        if (tx.type === 'count') {
          countTimeline.push({ date: tx.date, quantity: tx.quantity });
        }
      });

      // Find the most recent count before each transaction
      itemTransactions.forEach(tx => {
        // Find the most recent count that happened ON or BEFORE this transaction
        let applicableCount: Decimal | null = null;
        let applicableCountDate: Date | null = null;

        for (let i = countTimeline.length - 1; i >= 0; i--) {
          if (countTimeline[i].date <= tx.date) {
            applicableCount = countTimeline[i].quantity;
            applicableCountDate = countTimeline[i].date;
            break;
          }
        }

        // If this transaction is a count, it becomes the new baseline
        if (tx.type === 'count') {
          currentStock = tx.quantity;
        }
        // Only process regular transactions if they happen AFTER the most recent count
        else if (applicableCountDate === null || tx.date > applicableCountDate) {
          switch (tx.type) {
            case 'receipt':
            case 'transferIn':
              currentStock = currentStock.plus(tx.quantity);
              break;
            case 'dispatch':
            case 'transferOut':
              currentStock = currentStock.minus(tx.quantity); // ALLOW NEGATIVE
              break;
          }
        }
        // If transaction happened BEFORE the most recent count, skip it
        // (it's already accounted for in the count)
      });

      results[key] = currentStock;
      updateProgress();
    });

    calculationManager.endTimer(processTimerKey); // End timer if we started it

    // Convert Decimal results to numbers and cache
    const finalResults: { [key: string]: number } = {};
    Object.entries(results).forEach(([key, decimalQuantity]) => {
      const quantity = decimalQuantity.toNumber();
      finalResults[key] = quantity;

      // Cache individual results for faster single-item lookups
      const [itemId, binId] = key.split('-');
      setCachedStockItem(`single-${itemId}-${binId}`, key, quantity);
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Calculated ${itemIds.length} items for bin ${binId} in ${duration}ms`);

    return finalResults;
  } catch (error) {
    console.error(`❌ Error calculating stock for bin ${binId}:`, error);
    // Return zeros but track the error
    const results: { [key: string]: number } = {};
    itemIds.forEach(itemId => {
      results[`${itemId}-${binId}`] = 0;
    });
    return results;
  } finally {
    releaseLock();
  }
};

// Original method as fallback
const calculateBulkStockOriginal = async (
  stockItemIds: string[],
  binIds: string[]
): Promise<{ [key: string]: number }> => {
  const results: { [key: string]: number } = {};

  for (const binId of binIds) {
    for (const itemId of stockItemIds) {
      const key = `${itemId}-${binId}`;
      results[key] = await getStockSnapshot(itemId, binId);
    }
  }

  return results;
};

// ========== ENHANCED PUBLIC API FUNCTIONS ==========

// Input validation helper
const validateStockInput = (stockItemId: string, binId: string): void => {
  if (!stockItemId || typeof stockItemId !== 'string') {
    throw new Error('Invalid stockItemId: must be a non-empty string');
  }
  if (!binId || typeof binId !== 'string') {
    throw new Error('Invalid binId: must be a non-empty string');
  }
};

// 1. Single item calculation with detailed error reporting
// Then in the calculateStock function, add validation at the beginning:
export const calculateStock = async (
  stockItemId: string,
  binId: string
): Promise<{ quantity: number; metadata?: any; error?: string }> => {
  const startTime = Date.now();

  try {
    validateStockInput(stockItemId, binId); // Add this line

    if (!stockItemId || !binId) {
      throw new Error('Missing itemId or binId');
    }

    const results = await calculateBulkStock([stockItemId], [binId]);
    const key = `${stockItemId}-${binId}`;
    const quantity = results[key] || 0;

    const duration = Date.now() - startTime;

    trackMetric({
      timestamp: Date.now(),
      duration,
      cacheHit: false, // Will be tracked in calculateBulkStock
      itemsProcessed: 1,
      fromCache: 0,
      calculated: 1
    });

    return {
      quantity,
      metadata: {
        calculationTime: duration,
        cached: false
      }
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    trackMetric({
      timestamp: Date.now(),
      duration,
      cacheHit: false,
      itemsProcessed: 1,
      fromCache: 0,
      calculated: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return {
      quantity: 0,
      error: error instanceof Error ? error.message : 'Failed to calculate stock'
    };
  }
};

// 2. Enhanced bulk calculation with progress tracking - UPDATED VERSION
export const calculateBulkStock = async (
  stockItemIds: string[],
  binIds: string[],
  onProgress?: (progress: { stage: string; percentage: number }) => void
): Promise<{ [key: string]: number }> => {
  const startTime = Date.now();
  const cacheKey = `bulk-${JSON.stringify(stockItemIds.sort())}-${JSON.stringify(binIds.sort())}`;

  // Use calculation manager to prevent duplicate calculations
  const lockKey = `bulk-calculation-${cacheKey}`;
  const releaseLock = await calculationManager.acquireCalculationLock(lockKey);

  try {
    onProgress?.({ stage: 'Starting calculation...', percentage: 0 });

    // Check cache first
    const cached = getCachedStock(cacheKey) as { [key: string]: number } | undefined;
    if (cached && Object.keys(cached).length > 0) {
      console.log('📦 Using cached stock data');

      trackMetric({
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        cacheHit: true,
        itemsProcessed: stockItemIds.length * binIds.length,
        fromCache: stockItemIds.length * binIds.length,
        calculated: 0
      });

      onProgress?.({ stage: 'Loaded from cache', percentage: 100 });
      return cached;
    }

    if (stockItemIds.length === 0 || binIds.length === 0) {
      return {};
    }

    onProgress?.({ stage: 'Fetching snapshots...', percentage: 10 });

    // Fetch ALL snapshots in ONE query
    const snapshotQuery = groq`{
      "snapshots": *[
        _type == "stockSnapshot" && 
        stockItem._ref in $stockItemIds && 
        bin._ref in $binIds
      ] {
        "itemId": stockItem._ref,
        "binId": bin._ref,
        quantity,
        lastUpdated
      },
      "totalSnapshots": count(*[_type == "stockSnapshot"])
    }`;

    const snapshotTimerKey = '🔍 Fetching snapshots';
    if (!calculationManager.hasActiveTimer(snapshotTimerKey)) {
      calculationManager.startTimer(snapshotTimerKey);
    }

    const snapshotData = await client.fetch(snapshotQuery, { stockItemIds, binIds });

    calculationManager.endTimer(snapshotTimerKey);

    onProgress?.({ stage: 'Processing snapshots...', percentage: 30 });

    // Create a map for O(1) lookup
    const snapshotMap: { [key: string]: number } = {};
    snapshotData.snapshots?.forEach((snapshot: any) => {
      const key = `${snapshot.itemId}-${snapshot.binId}`;
      snapshotMap[key] = snapshot.quantity || 0;
    });

    const results: { [key: string]: number } = {};
    const itemsWithoutSnapshots: Array<{ itemId: string; binId: string }> = [];

    // Fill in results
    for (const binId of binIds) {
      for (const itemId of stockItemIds) {
        const key = `${itemId}-${binId}`;

        if (snapshotMap[key] !== undefined) {
          results[key] = snapshotMap[key];
        } else {
          results[key] = 0;
          itemsWithoutSnapshots.push({ itemId, binId });
        }
      }
    }

    onProgress?.({ stage: 'Calculating missing data...', percentage: 50 });

    // Calculate missing snapshots in BULK
    if (itemsWithoutSnapshots.length > 0) {
      console.log(`📊 ${itemsWithoutSnapshots.length} items need calculation`);

      // Group by bin to calculate more efficiently
      const itemsByBin: { [binId: string]: string[] } = {};
      itemsWithoutSnapshots.forEach(({ itemId, binId }) => {
        if (!itemsByBin[binId]) itemsByBin[binId] = [];
        itemsByBin[binId].push(itemId);
      });

      // Calculate in parallel for each bin with progress
      const binPromises = Object.entries(itemsByBin).map(async ([binId, itemIds], index) => {
        const binProgress = (percentage: number) => {
          const base = 50;
          const range = 40;
          const binPercentage = base + ((percentage / 100) * range * (index + 1) / Object.keys(itemsByBin).length);
          onProgress?.({
            stage: `Calculating bin ${binId}...`,
            percentage: Math.min(90, binPercentage)
          });
        };

        const binTimerKey = `🧮 Calculating bin ${binId}`;
        if (!calculationManager.hasActiveTimer(binTimerKey)) {
          calculationManager.startTimer(binTimerKey);
        }

        const binResults = await calculateStockForBin(binId, itemIds, binProgress);

        calculationManager.endTimer(binTimerKey);
        return binResults;
      });

      const allBinResults = await Promise.all(binPromises);

      // Merge results
      allBinResults.forEach(binResult => {
        Object.assign(results, binResult);
      });

      console.log(`✅ Calculated ${itemsWithoutSnapshots.length} missing snapshots`);
    }

    onProgress?.({ stage: 'Finalizing results...', percentage: 95 });

    // Cache the results
    setCachedStock(cacheKey, results as StockDataCache);

    const duration = Date.now() - startTime;
    const fromCache = Object.keys(results).length - itemsWithoutSnapshots.length;

    trackMetric({
      timestamp: Date.now(),
      duration,
      cacheHit: false,
      itemsProcessed: stockItemIds.length * binIds.length,
      fromCache,
      calculated: itemsWithoutSnapshots.length
    });

    console.log('✅ OPTIMIZED calculateBulkStock complete');
    console.log('📈 Results summary:', {
      totalCombinations: Object.keys(results).length,
      fromSnapshots: fromCache,
      calculated: itemsWithoutSnapshots.length,
      nonZeroResults: Object.values(results).filter(v => v > 0).length,
      duration: `${duration}ms`
    });

    onProgress?.({ stage: 'Complete', percentage: 100 });

    return results;
  } catch (error) {
    console.error('❌ Error in optimized calculateBulkStock:', error);

    trackMetric({
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      cacheHit: false,
      itemsProcessed: stockItemIds.length * binIds.length,
      fromCache: 0,
      calculated: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    onProgress?.({ stage: 'Error occurred', percentage: 100 });

    // Fallback to original method if optimized fails
    console.log('🔄 Falling back to original method...');
    const fallbackResults = await calculateBulkStockOriginal(stockItemIds, binIds);
    setCachedStock(cacheKey, fallbackResults as any);
    return fallbackResults;
  } finally {
    releaseLock();
  }
};

// 3. Enhanced getBinStock with metadata
export const getBinStock = async (
  stockItemIds: string[],
  binId: string
): Promise<{
  [key: string]: {
    quantity: number;
    lastUpdated?: string;
    confidence?: 'high' | 'medium' | 'low';
  }
}> => {
  console.log(`📊 Getting bin stock for ${stockItemIds.length} items in bin ${binId}`);

  if (!binId || stockItemIds.length === 0) {
    return {};
  }

  const results = await calculateBulkStock(stockItemIds, [binId]);

  // Enhanced results with metadata
  const enhancedResults: { [key: string]: any } = {};
  let foundItems = 0;

  // Get additional metadata for each item
  for (const itemId of stockItemIds) {
    const compositeKey = `${itemId}-${binId}`;
    const quantity = results[compositeKey] || 0;

    if (quantity > 0) {
      foundItems++;
    }

    // Get cache confidence if available
    const cacheKey = `${itemId}-${binId}`;
    const cached = snapshotCache.get(cacheKey);

    enhancedResults[itemId] = {
      quantity,
      lastUpdated: cached?.timestamp ? new Date(cached.timestamp).toISOString() : undefined,
      confidence: cached?.metadata?.confidence
    };
  }

  console.log(`✅ Found stock for ${foundItems}/${stockItemIds.length} items`);
  return enhancedResults;
};

// 4. Transaction-based calculation (for validation)
export const calculateBulkStockFromTransactions = async (
  stockItemIds: string[],
  binIds: string[]
): Promise<{ [key: string]: number }> => {
  console.log('🧮 Starting calculateBulkStockFromTransactions...');

  if (stockItemIds.length === 0 || binIds.length === 0) {
    return {};
  }

  try {
    // Get ALL transactions in chronological order
    const query = groq`{
      "goodsReceipts": *[
        _type == "GoodsReceipt" && 
        receivingBin._ref in $binIds &&
        status in ["completed", "processed"]
      ] | order(receiptDate asc) {
        _type,
        _id,
        receiptDate,
        "binId": receivingBin._ref,
        receivedItems[] {
          "itemId": stockItem._ref,
          receivedQuantity
        }
      },
      
      "dispatches": *[
        _type == "DispatchLog" && 
        sourceBin._ref in $binIds &&
        status in ["completed", "processed"]
      ] | order(dispatchDate asc) {
        _type,
        _id,
        dispatchDate,
        "binId": sourceBin._ref,
        dispatchedItems[] {
          "itemId": stockItem._ref,
          dispatchedQuantity
        }
      },
      
      "transfers": *[
        _type == "InternalTransfer" && 
        status == "completed" && 
        (fromBin._ref in $binIds || toBin._ref in $binIds)
      ] | order(transferDate asc) {
        _type,
        _id,
        transferDate,
        "fromBinId": fromBin._ref,
        "toBinId": toBin._ref,
        transferredItems[] {
          "itemId": stockItem._ref,
          transferredQuantity
        }
      },
      
      "allCounts": *[
        _type == "InventoryCount" && 
        bin._ref in $binIds &&
        status == "completed"
      ] | order(countDate asc) {
        _id,
        "binId": bin._ref,
        countDate,
        countedItems[] {
          "itemId": stockItem._ref,
          countedQuantity
        }
      }
    }`;

    const data = await client.fetch(query, { binIds, stockItemIds });

    console.log('📊 Transaction data counts:');
    console.log('- Goods Receipts:', data.goodsReceipts?.length || 0);
    console.log('- Dispatches:', data.dispatches?.length || 0);
    console.log('- Transfers:', data.transfers?.length || 0);
    console.log('- Inventory Counts:', data.allCounts?.length || 0);

    // Initialize with 0
    const results: { [key: string]: Decimal } = {};
    binIds.forEach(binId => {
      stockItemIds.forEach(itemId => {
        const key = `${itemId}-${binId}`;
        results[key] = new Decimal(0);
      });
    });

    // Build transaction timeline
    const allTransactions: Array<{
      type: 'goodsReceipt' | 'dispatch' | 'transferOut' | 'transferIn' | 'inventoryCount';
      date: string;
      binId: string;
      itemId: string;
      quantity: number;
    }> = [];

    // Add Goods Receipts
    data.goodsReceipts?.forEach((receipt: any) => {
      receipt.receivedItems?.forEach((item: any) => {
        if (item.itemId && stockItemIds.includes(item.itemId)) {
          allTransactions.push({
            type: 'goodsReceipt',
            date: receipt.receiptDate,
            binId: receipt.binId,
            itemId: item.itemId,
            quantity: item.receivedQuantity || 0
          });
        }
      });
    });

    // Add Dispatches
    data.dispatches?.forEach((dispatch: any) => {
      dispatch.dispatchedItems?.forEach((item: any) => {
        if (item.itemId && stockItemIds.includes(item.itemId)) {
          allTransactions.push({
            type: 'dispatch',
            date: dispatch.dispatchDate,
            binId: dispatch.binId,
            itemId: item.itemId,
            quantity: item.dispatchedQuantity || 0
          });
        }
      });
    });

    // Add Transfers
    // NEW (fixed - prevents double counting for same bin):
    // Add Transfers - WITH double-counting prevention
    data.transfers?.forEach((transfer: any) => {
      transfer.transferredItems?.forEach((item: any) => {
        const quantity = item.transferredQuantity || 0;

        if (item.itemId && stockItemIds.includes(item.itemId)) {
          // Prevent processing same bin transfers (shouldn't happen but defensive)
          if (transfer.fromBinId !== transfer.toBinId) {
            // For EACH bin, add ONE transaction
            if (transfer.fromBinId && binIds.includes(transfer.fromBinId)) {
              allTransactions.push({
                type: 'transferOut',
                date: transfer.transferDate,
                binId: transfer.fromBinId,
                itemId: item.itemId,
                quantity: quantity
              });
            }

            if (transfer.toBinId && binIds.includes(transfer.toBinId)) {
              allTransactions.push({
                type: 'transferIn',
                date: transfer.transferDate,
                binId: transfer.toBinId,
                itemId: item.itemId,
                quantity: quantity
              });
            }
          }
        }
      });
    });

    // Add Inventory Counts
    data.allCounts?.forEach((count: any) => {
      count.countedItems?.forEach((item: any) => {
        if (item.itemId && stockItemIds.includes(item.itemId)) {
          allTransactions.push({
            type: 'inventoryCount',
            date: count.countDate,
            binId: count.binId,
            itemId: item.itemId,
            quantity: item.countedQuantity || 0
          });
        }
      });
    });

    // Sort by date
    allTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // In calculateBulkStockFromTransactions function, replace the processing logic:
    console.log(`📊 Processing ${allTransactions.length} transactions...`);

    // Track last inventory count per item-bin
    const lastCountMap: { [key: string]: Date } = {};

    // Process transactions
    allTransactions.forEach((tx, index) => {
      const key = `${tx.itemId}-${tx.binId}`;
      const lastCountDate = lastCountMap[key];

      // Skip if transaction is before last inventory count
      if (lastCountDate && new Date(tx.date) < lastCountDate) {
        return;
      }

      switch (tx.type) {
        case 'goodsReceipt':
        case 'transferIn':
          results[key] = results[key].plus(tx.quantity);
          break;
        case 'dispatch':
        case 'transferOut':
          results[key] = results[key].minus(tx.quantity); // ALLOW NEGATIVE
          break;
        case 'inventoryCount':
          // Inventory count SETS the absolute value
          results[key] = new Decimal(tx.quantity);
          lastCountMap[key] = new Date(tx.date); // Update last count date
          break;
      }
    });

    // Convert to final results
    const finalResults: { [key: string]: number } = {};
    for (const key in results) {
      finalResults[key] = results[key].toNumber();
    }

    console.log('✅ calculateBulkStockFromTransactions complete');
    return finalResults;

  } catch (error) {
    console.error('❌ Error in calculateBulkStockFromTransactions:', error);
    return {};
  }
};

// 5. Hook to update snapshots when transactions occur
export async function updateStockForTransaction(
  transactionType: 'dispatch' | 'transfer' | 'inventoryCount' | 'procurement' | 'adjustment',
  transactionId: string
) {
  try {
    console.log(`📊 Updating stock snapshots for ${transactionType}:`, transactionId);

    let transaction: any;
    let items: Array<{ stockItemId: string, quantity: number, binId: string }> = [];

    // Fetch transaction data
    switch (transactionType) {
      case 'dispatch':
        transaction = await client.fetch(
          groq`*[_type == "DispatchLog" && _id == $id][0] {
            _id,
            dispatchNumber,
            evidenceStatus,
            "sourceBin": sourceBin._ref,
            "dispatchedItems": dispatchedItems[]{
              "stockItemId": stockItem._ref,
              dispatchedQuantity
            }
          }`,
          { id: transactionId }
        );

        if (!transaction) {
          console.error(`❌ Dispatch ${transactionId} not found`);
          return;
        }

        items = (transaction.dispatchedItems || []).map((item: any) => ({
          stockItemId: item.stockItemId,
          quantity: -(item.dispatchedQuantity || 0),
          binId: transaction.sourceBin
        }));
        break;

      case 'transfer':
        transaction = await client.fetch(
          groq`*[_type == "InternalTransfer" && _id == $id][0] {
            _id,
            transferNumber,
            status,
            "fromBin": fromBin._ref,
            "toBin": toBin._ref,
            "transferredItems": transferredItems[]{
              "stockItemId": stockItem._ref,
              transferredQuantity
            }
          }`,
          { id: transactionId }
        );

        if (!transaction) {
          console.error(`❌ Transfer ${transactionId} not found`);
          return;
        }

        // Create items for both source and destination bins
        items = [];
        (transaction.transferredItems || []).forEach((item: any) => {
          // Source bin (negative)
          if (transaction.fromBin) {
            items.push({
              stockItemId: item.stockItemId,
              quantity: -(item.transferredQuantity || 0),
              binId: transaction.fromBin
            });
          }
          // Destination bin (positive)
          if (transaction.toBin) {
            items.push({
              stockItemId: item.stockItemId,
              quantity: item.transferredQuantity || 0,
              binId: transaction.toBin
            });
          }
        });
        break;

      case 'inventoryCount':
        transaction = await client.fetch(
          groq`*[_type == "InventoryCount" && _id == $id][0] {
            _id,
            countNumber,
            status,
            "bin": bin._ref,
            "countedItems": countedItems[]{
              "stockItemId": stockItem._ref,
              countedQuantity
            }
          }`,
          { id: transactionId }
        );

        if (!transaction) {
          console.error(`❌ Inventory Count ${transactionId} not found`);
          return;
        }

        items = (transaction.countedItems || []).map((item: any) => ({
          stockItemId: item.stockItemId,
          quantity: item.countedQuantity || 0,
          binId: transaction.bin
        }));
        break;

      default:
        console.error(`❌ Unsupported transaction type: ${transactionType}`);
        return;
    }

    console.log(`🔄 Processing ${items.length} items for ${transactionType}`);

    // Process items with proper locking
    const updatePromises = items.map(async (item) => {
      if (!item.stockItemId || !item.binId) {
        console.warn('⚠️ Skipping item without stockItemId or binId');
        return;
      }

      const lockKey = `${item.stockItemId}-${item.binId}`;
      const mutex = getMutexForKey(lockKey);


      // Use mutex to prevent race conditions
      return mutex.runExclusive(async () => {
        try {
          // Re-fetch current stock WITHIN the lock to ensure we have latest
          const currentSnapshot = await client.fetch(
            groq`*[_type == "stockSnapshot" && stockItem._ref == $stockItemId && bin._ref == $binId][0]{
              quantity,
              lastUpdated
            }`,
            { stockItemId: item.stockItemId, binId: item.binId }
          );

          let currentStock = currentSnapshot?.quantity || 0;

          // If no snapshot exists, calculate from transactions
          if (!currentSnapshot) {
            currentStock = await calculateStockFromTransactions(item.stockItemId, item.binId, false);
          }

          // Calculate new stock with validation
          let newStock;
          if (transactionType === 'inventoryCount') {
            // Inventory counts set the absolute quantity
            newStock = item.quantity;
          } else {
            // Other transactions adjust the quantity
            newStock = currentStock + item.quantity;

            // Validate no negative stock (except for special cases)
            if (newStock < 0) {
              console.warn(`⚠️ Negative stock detected for ${item.stockItemId} in ${item.binId}: ${newStock}. Setting to 0.`);
              // DON'T set to 0 - keep negative for analysis
              // newStock = 0;
            }
          }

          console.log(`📦 Updating ${transactionType} stock:`, {
            stockItemId: item.stockItemId,
            binId: item.binId,
            current: currentStock,
            adjustment: item.quantity,
            new: newStock
          });

          // Update the snapshot
          await updateStockSnapshot(
            item.stockItemId,
            item.binId,
            newStock,
            transactionType,
            transactionId
          );

        } catch (error) {
          console.error(`❌ Failed to update stock for item ${item.stockItemId}:`, error);
          throw error; // Re-throw to ensure transaction integrity
        }
      });
    });

    // Wait for all updates to complete
    await Promise.all(updatePromises);

    console.log(`🎉 Stock snapshots updated for ${transactionType} ${transactionId}`);

  } catch (error) {
    console.error(`❌ Failed to update stock for ${transactionType}:`, error);
    throw error;
  }
}

// 6. Initialize all stock snapshots (run once)
export const initializeAllStockSnapshots = async (): Promise<void> => {
  console.log('🏁 Initializing all stock snapshots...');

  // Get all stock items and bins
  const [stockItems, bins] = await Promise.all([
    client.fetch(groq`*[_type == "StockItem"] { _id, name }`),
    client.fetch(groq`*[_type == "Bin"] { _id, name }`)
  ]);

  const stockItemIds = stockItems.map((item: any) => item._id);
  const binIds = bins.map((bin: any) => bin._id);

  let count = 0;
  const total = stockItemIds.length * binIds.length;

  console.log(`📊 Initializing ${total} snapshots...`);

  // Create/update snapshots for all combinations with progress logging
  for (const binId of binIds) {
    for (const itemId of stockItemIds) {
      try {
        const stock = await calculateStockFromTransactions(itemId, binId, false);
        await updateStockSnapshot(itemId, binId, stock, 'initial', null);
        count++;

        if (count % 100 === 0 || count === total) {
          const percentage = Math.round((count / total) * 100);
          console.log(`  📈 Created ${count}/${total} snapshots (${percentage}%)...`);
        }
      } catch (error) {
        console.error(`❌ Failed to initialize snapshot for ${itemId}-${binId}:`, error);
      }
    }
  }

  console.log(`✅ Initialized ${count} stock snapshots`);
};

// 7. Validate stock consistency (debugging tool)
export const validateStockConsistency = async (
  stockItemIds: string[],
  binIds: string[]
): Promise<{
  valid: boolean;
  issues: Array<{
    itemId: string;
    binId: string;
    snapshotStock: number;
    calculatedStock: number;
    difference: number;
  }>;
}> => {
  console.log('🔍 Validating stock consistency...');

  try {
    // Get stock from snapshots
    const snapshotResults = await calculateBulkStock(stockItemIds, binIds);

    // Calculate stock from transactions
    const calculatedResults = await calculateBulkStockFromTransactions(stockItemIds, binIds);

    const issues: Array<{
      itemId: string;
      binId: string;
      snapshotStock: number;
      calculatedStock: number;
      difference: number;
    }> = [];

    // Compare results
    for (const key in snapshotResults) {
      const snapshotStock = snapshotResults[key];
      const calculatedStock = calculatedResults[key] || 0;
      const difference = Math.abs(snapshotStock - calculatedStock);

      if (difference > 0.01) { // Allow for floating-point precision
        const [itemId, binId] = key.split('-');
        issues.push({
          itemId,
          binId,
          snapshotStock,
          calculatedStock,
          difference
        });
      }
    }

    console.log(`✅ Stock consistency check complete. Issues: ${issues.length}`);

    return {
      valid: issues.length === 0,
      issues
    };
  } catch (error) {
    console.error('❌ Error validating stock consistency:', error);
    return {
      valid: false,
      issues: []
    };
  }
};

// 8. Get stock as of specific date (for historical reports)
export const getStockAsOfDate = async (
  stockItemIds: string[],
  binIds: string[],
  asOfDate: Date
): Promise<{ [key: string]: number }> => {
  console.log(`📅 Getting stock as of ${asOfDate.toISOString().split('T')[0]}...`);

  if (stockItemIds.length === 0 || binIds.length === 0) {
    return {};
  }

  try {
    const dateString = asOfDate.toISOString();
    const results: { [key: string]: number } = {};

    // Initialize all combinations with 0
    binIds.forEach(binId => {
      stockItemIds.forEach(itemId => {
        results[`${itemId}-${binId}`] = 0;
      });
    });

    // Process each bin separately for better performance
    for (const binId of binIds) {
      console.time(`📥 Processing bin ${binId}`);

      const binQuery = groq`{
        "goodsReceipts": *[
          _type == "GoodsReceipt" && 
          receivingBin._ref == $binId &&
          status in ["completed", "processed"] &&
          receiptDate <= $dateString
        ] | order(receiptDate asc) {
          receiptDate,
          receivedItems[] {
            "itemId": stockItem._ref,
            receivedQuantity
          }
        },
        
        "dispatches": *[
          _type == "DispatchLog" && 
          sourceBin._ref == $binId &&
          status in ["completed", "processed"] &&
          dispatchDate <= $dateString
        ] | order(dispatchDate asc) {
          dispatchDate,
          dispatchedItems[] {
            "itemId": stockItem._ref,
            dispatchedQuantity
          }
        }
          ,
        
        "transfersOut": *[
          _type == "InternalTransfer" && 
          status == "completed" && 
          fromBin._ref == $binId &&
          transferDate <= $dateString
        ] | order(transferDate asc) {
          transferDate,
          transferredItems[] {
            "itemId": stockItem._ref,
            transferredQuantity
          }
        },
        
        "transfersIn": *[
          _type == "InternalTransfer" && 
          status == "completed" && 
          toBin._ref == $binId &&
          transferDate <= $dateString
        ] | order(transferDate asc) {
          transferDate,
          transferredItems[] {
            "itemId": stockItem._ref,
            transferredQuantity
          }
        },
        
        "lastCount": *[
          _type == "InventoryCount" && 
          bin._ref == $binId &&
          status == "completed" &&
          countDate <= $dateString
        ] | order(countDate desc)[0] {
          countDate,
          countedItems[] {
            "itemId": stockItem._ref,
            countedQuantity
          }
        }
      }`;

      const data = await client.fetch(binQuery, { binId, dateString, stockItemIds });

      // Process each item in the bin
      stockItemIds.forEach(itemId => {
        const key = `${itemId}-${binId}`;
        let stock = 0;
        let lastCountDate: Date | null = null;

        // Process goods receipts
        data.goodsReceipts?.forEach((receipt: any) => {
          const receiptDate = new Date(receipt.receiptDate);
          // Skip if before last inventory count
          if (lastCountDate && receiptDate < lastCountDate) return;

          receipt.receivedItems?.forEach((item: any) => {
            if (item.itemId === itemId) {
              stock += item.receivedQuantity || 0;
            }
          });
        });

        // Process dispatches
        data.dispatches?.forEach((dispatch: any) => {
          const dispatchDate = new Date(dispatch.dispatchDate);
          // Skip if before last inventory count
          if (lastCountDate && dispatchDate < lastCountDate) return;

          dispatch.dispatchedItems?.forEach((item: any) => {
            if (item.itemId === itemId) {
              stock = stock - (item.dispatchedQuantity || 0);
            }
          });
        });

        // Process transfers out
        data.transfersOut?.forEach((transfer: any) => {
          const transferDate = new Date(transfer.transferDate);
          // Skip if before last inventory count
          if (lastCountDate && transferDate < lastCountDate) return;

          transfer.transferredItems?.forEach((item: any) => {
            if (item.itemId === itemId) {
              stock = stock - (item.transferredQuantity || 0);
            }
          });
        });

        // Process transfers in
        data.transfersIn?.forEach((transfer: any) => {
          const transferDate = new Date(transfer.transferDate);
          // Skip if before last inventory count
          if (lastCountDate && transferDate < lastCountDate) return;

          transfer.transferredItems?.forEach((item: any) => {
            if (item.itemId === itemId) {
              stock += item.transferredQuantity || 0;
            }
          });
        });

        // Process inventory counts (in chronological order)
        const sortedCounts = (data.allCounts || []).sort((a: any, b: any) =>
          new Date(a.countDate).getTime() - new Date(b.countDate).getTime()
        );

        sortedCounts.forEach((count: any) => {
          const countDate = new Date(count.countDate);
          count.countedItems?.forEach((item: any) => {
            if (item.itemId === itemId) {
              // Inventory count SETS the stock at that point
              stock = item.countedQuantity || 0;
              lastCountDate = countDate; // Update last count date
            }
          });
        });

        results[key] = stock;
      });

      console.timeEnd(`📥 Processing bin ${binId}`);
    }

    console.log('✅ Historical stock calculation complete');
    return results;

  } catch (error) {
    console.error('❌ Error in getStockAsOfDate:', error);
    return {};
  }
};

// 9. Force refresh stock snapshot for specific item-bin
export const refreshStockSnapshot = async (stockItemId: string, binId: string): Promise<number> => {
  console.log(`🔄 Refreshing stock snapshot for ${stockItemId} in ${binId}`);

  const calculatedStock = await calculateStockFromTransactions(stockItemId, binId);
  await updateStockSnapshot(stockItemId, binId, calculatedStock, 'refresh', null);

  console.log(`✅ Snapshot refreshed: ${calculatedStock}`);
  return calculatedStock;
};

// 10. Get all stock snapshots (admin/debugging)
export const getAllStockSnapshots = async (): Promise<Array<{
  _id: string;
  stockItem: { _ref: string };
  bin: { _ref: string };
  quantity: number;
  lastUpdated: string;
}>> => {
  const query = groq`*[_type == "stockSnapshot"] {
    _id,
    stockItem->{ _id, name },
    bin->{ _id, name },
    quantity,
    lastUpdated
  } | order(lastUpdated desc)`;

  return await client.fetch(query);
};

// 11. Get stock with freshness indicator
export const getStockWithFreshness = async (
  stockItemId: string,
  binId: string
): Promise<{
  quantity: number;
  freshness: 'fresh' | 'stale' | 'calculating';
  lastUpdated?: string;
  cached: boolean;
}> => {
  const cacheKey = `${stockItemId}-${binId}`;
  const cached = snapshotCache.get(cacheKey); // OptimizedSnapshotCache handles TTL

  if (cached) {
    const age = Date.now() - cached.timestamp;
    const freshness = age < 10000 ? 'fresh' : age < 30000 ? 'stale' : 'calculating';

    return {
      quantity: cached.quantity,
      freshness,
      lastUpdated: new Date(cached.timestamp).toISOString(),
      cached: true
    };
  }

  // Not cached, calculate fresh
  const result = await calculateStock(stockItemId, binId);

  return {
    quantity: result.quantity,
    freshness: 'fresh',
    cached: false
  };
};

// 12. Batch update stock with transaction batching
export const batchUpdateStock = async (
  updates: Array<{
    stockItemId: string;
    binId: string;
    quantity: number;
    transactionType: string;
    transactionId: string;
  }>
): Promise<void> => {
  console.log(`🔄 Batch updating ${updates.length} stock items`);

  // Group by transaction to optimize database operations
  const updatesByTransaction = new Map<string, typeof updates>();

  updates.forEach(update => {
    if (!updatesByTransaction.has(update.transactionId)) {
      updatesByTransaction.set(update.transactionId, []);
    }
    updatesByTransaction.get(update.transactionId)!.push(update);
  });

  // Process each transaction's updates
  for (const [transactionId, transactionUpdates] of updatesByTransaction) {
    try {
      // Optimistic cache updates
      transactionUpdates.forEach(update => {
        const cacheKey = `${update.stockItemId}-${update.binId}`;
        snapshotCache.set(cacheKey, update.quantity, { confidence: 'high' });
      });

      // Batch database operations
      const operations = transactionUpdates.map(update =>
        writeClient.patch(`stockSnapshot-${update.stockItemId}-${update.binId}`)
          .set({
            quantity: update.quantity,
            lastUpdated: new Date().toISOString(),
            transactionType: update.transactionType,
            transactionId: update.transactionId
          })
          .commit()
      );

      await Promise.all(operations);

      console.log(`✅ Batch updated ${transactionUpdates.length} items for transaction ${transactionId}`);
    } catch (error) {
      console.error(`❌ Failed to batch update for transaction ${transactionId}:`, error);

      // Revert optimistic updates on error
      transactionUpdates.forEach(update => {
        const cacheKey = `${update.stockItemId}-${update.binId}`;
        snapshotCache.delete(cacheKey);
      });

      throw error;
    }
  }
};

// 13. Get low stock predictions (UX enhancement)
export const getLowStockPredictions = async (
  stockItemIds: string[],
  binIds: string[],
  daysAhead: number = 7
): Promise<{
  [key: string]: {
    current: number;
    predicted: number;
    confidence: number;
    willRunOut: boolean;
    estimatedDaysUntilOut: number | null;
  }
}> => {
  console.log(`🔮 Predicting low stock for ${stockItemIds.length} items over ${daysAhead} days`);

  const results: any = {};

  // Get current stock
  const currentStock = await calculateBulkStock(stockItemIds, binIds);

  // Simple prediction based on average daily usage (you can enhance this)
  for (const binId of binIds) {
    for (const itemId of stockItemIds) {
      const key = `${itemId}-${binId}`;
      const current = currentStock[key] || 0;

      // TODO: Implement actual prediction algorithm based on historical data
      // For now, return placeholder predictions
      const averageDailyUsage = 5; // Placeholder
      const predicted = Math.max(0, current - (averageDailyUsage * daysAhead));
      const estimatedDaysUntilOut = current > 0 ? Math.floor(current / averageDailyUsage) : 0;

      results[key] = {
        current,
        predicted,
        confidence: 0.7, // Placeholder confidence score
        willRunOut: predicted <= 0,
        estimatedDaysUntilOut: estimatedDaysUntilOut > 0 ? estimatedDaysUntilOut : null
      };
    }
  }

  return results;
};

// 14. Stock History with enhanced UX
export interface StockHistoryEntry {
  date: string;
  stock: number;
  events?: Array<{
    type: string;
    quantity: number;
    description?: string;
  }>;
}

export const getStockHistory = async (
  stockItemId: string,
  binId: string,
  startDate: Date,
  endDate: Date
): Promise<StockHistoryEntry[]> => {
  console.log(`📊 Getting stock history for ${stockItemId} in ${binId} from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

  try {
    const query = groq`{
      "goodsReceipts": *[
        _type == "GoodsReceipt" && 
        receivingBin._ref == $binId &&
        stockItem._ref == $stockItemId &&
        status in ["completed", "processed"] &&
        receiptDate >= $startDate &&
        receiptDate <= $endDate
      ] | order(receiptDate asc) {
        receiptDate,
        receiptNumber,
        receivedItems[] {
          "itemId": stockItem._ref,
          receivedQuantity
        }
      },
      
      "dispatches": *[
        _type == "DispatchLog" && 
        sourceBin._ref == $binId &&
        stockItem._ref == $stockItemId &&
        status in ["completed", "processed"] &&
        dispatchDate >= $startDate &&
        dispatchDate <= $endDate
      ] | order(dispatchDate asc) {
        dispatchDate,
        dispatchNumber,
        dispatchedItems[] {
          "itemId": stockItem._ref,
          dispatchedQuantity
        }
      },
      
      "transfersOut": *[
        _type == "InternalTransfer" && 
        status == "completed" && 
        fromBin._ref == $binId &&
        stockItem._ref == $stockItemId &&
        transferDate >= $startDate &&
        transferDate <= $endDate
      ] | order(transferDate asc) {
        transferDate,
        transferNumber,
        transferredItems[] {
          "itemId": stockItem._ref,
          transferredQuantity
        }
      },
      
      "transfersIn": *[
        _type == "InternalTransfer" && 
        status == "completed" && 
        toBin._ref == $binId &&
        stockItem._ref == $stockItemId &&
        transferDate >= $startDate &&
        transferDate <= $endDate
      ] | order(transferDate asc) {
        transferDate,
        transferNumber,
        transferredItems[] {
          "itemId": stockItem._ref,
          transferredQuantity
        }
      },
      
      "inventoryCounts": *[
        _type == "InventoryCount" && 
        bin._ref == $binId &&
        stockItem._ref == $stockItemId &&
        status == "completed" &&
        countDate >= $startDate &&
        countDate <= $endDate
      ] | order(countDate asc) {
        countDate,
        countNumber,
        countedItems[] {
          "itemId": stockItem._ref,
          countedQuantity
        }
      }
    }`;

    const data = await client.fetch(query, {
      stockItemId,
      binId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });

    // Build timeline of events
    const events: Array<{ date: Date; type: string; quantity: number; description?: string }> = [];

    // Add all events to timeline
    data.goodsReceipts?.forEach((receipt: any) => {
      receipt.receivedItems?.forEach((item: any) => {
        if (item.itemId === stockItemId) {
          events.push({
            date: new Date(receipt.receiptDate),
            type: 'goodsReceipt',
            quantity: item.receivedQuantity || 0,
            description: `Goods Receipt #${receipt.receiptNumber}`
          });
        }
      });
    });

    data.dispatches?.forEach((dispatch: any) => {
      dispatch.dispatchedItems?.forEach((item: any) => {
        if (item.itemId === stockItemId) {
          events.push({
            date: new Date(dispatch.dispatchDate),
            type: 'dispatch',
            quantity: -(item.dispatchedQuantity || 0),
            description: `Dispatch #${dispatch.dispatchNumber}`
          });
        }
      });
    });

    data.transfersOut?.forEach((transfer: any) => {
      transfer.transferredItems?.forEach((item: any) => {
        if (item.itemId === stockItemId) {
          events.push({
            date: new Date(transfer.transferDate),
            type: 'transferOut',
            quantity: -(item.transferredQuantity || 0),
            description: `Transfer Out #${transfer.transferNumber}`
          });
        }
      });
    });

    data.transfersIn?.forEach((transfer: any) => {
      transfer.transferredItems?.forEach((item: any) => {
        if (item.itemId === stockItemId) {
          events.push({
            date: new Date(transfer.transferDate),
            type: 'transferIn',
            quantity: item.transferredQuantity || 0,
            description: `Transfer In #${transfer.transferNumber}`
          });
        }
      });
    });

    data.inventoryCounts?.forEach((count: any) => {
      count.countedItems?.forEach((item: any) => {
        if (item.itemId === stockItemId) {
          events.push({
            date: new Date(count.countDate),
            type: 'inventoryCount',
            quantity: item.countedQuantity || 0,
            description: `Inventory Count #${count.countNumber}`
          });
        }
      });
    });

    // Sort events by date
    events.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Generate daily stock levels
    const history: StockHistoryEntry[] = [];
    let currentStock = 0;
    let currentDate = new Date(startDate);

    // Add initial stock (get stock at start date)
    const initialStock = await getStockAsOfDate([stockItemId], [binId], startDate);
    currentStock = initialStock[`${stockItemId}-${binId}`] || 0;

    history.push({
      date: currentDate.toISOString().split('T')[0],
      stock: currentStock
    });

    // Process each day
    let eventIndex = 0;
    currentDate.setDate(currentDate.getDate() + 1);

    while (currentDate <= endDate) {
      const dayEvents: StockHistoryEntry['events'] = [];

      // Apply any events that happened on this day
      while (eventIndex < events.length &&
        events[eventIndex].date.toISOString().split('T')[0] <= currentDate.toISOString().split('T')[0]) {

        const event = events[eventIndex];
        if (event.type === 'inventoryCount') {
          currentStock = event.quantity;
        } else {
          currentStock = currentStock + event.quantity;
        }

        dayEvents.push({
          type: event.type,
          quantity: event.quantity,
          description: event.description
        });

        eventIndex++;
      }

      history.push({
        date: currentDate.toISOString().split('T')[0],
        stock: currentStock,
        events: dayEvents.length > 0 ? dayEvents : undefined
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`✅ Generated ${history.length} days of stock history`);
    return history;

  } catch (error) {
    console.error('❌ Error in getStockHistory:', error);
    return [];
  }
};

// 15. Revert previous stock changes (with enhanced UX)
export async function revertPreviousStockChanges(transactionId: string) {
  try {
    console.log(`↩️ Reverting previous stock changes for transaction:`, transactionId);

    // Fetch all stock movements for this transaction
    const movements = await client.fetch(
      groq`*[_type == "StockMovement" && transactionId == $transactionId] {
        _id,
        stockItem->{
          _id,
          currentStock,
          name
        },
        quantity,
        previousStock,
        bin->{
          _id
        }
      }`,
      { transactionId }
    );

    console.log(`Found ${movements.length} stock movements to revert`);

    const revertPromises = movements.map(async (movement: any) => {
      if (!movement.stockItem?._id || !movement.bin?._id) return;

      const stockItemId = movement.stockItem._id;
      const binId = movement.bin._id;
      const quantityToRevert = Number(movement.quantity) || 0;
      const currentStock = Number(movement.stockItem.currentStock) || 0;

      // Revert the change
      const revertedStock = currentStock - quantityToRevert;

      // Update both systems:

      // 1. Update the stock item directly
      await writeClient
        .patch(stockItemId)
        .set({
          currentStock: revertedStock,
          updatedAt: new Date().toISOString()
        })
        .commit();

      // 2. ALSO update the stock snapshot
      await updateStockSnapshot(
        stockItemId,
        binId,
        revertedStock,
        'revert',
        transactionId
      );

      console.log(`↩️ Reverted ${movement.stockItem.name} stock:`, {
        current: currentStock,
        revertedBy: quantityToRevert,
        new: revertedStock
      });

      // Delete the movement record
      await writeClient.delete(movement._id);
    });

    await Promise.all(revertPromises);

    console.log(`✅ Reverted all previous stock changes for transaction ${transactionId}`);

  } catch (error) {
    console.error('❌ Failed to revert stock changes:', error);
    throw error;
  }
}

// 16. Utility function to clear all active timers (debugging)
export const clearAllTimers = (): void => {
  calculationManager.clearAllTimers();
  console.log('🧹 Cleared all active timers');
};

// 17. Utility function to get active calculation status (debugging)
export const getActiveCalculations = (): string[] => {
  return calculationManager.getLockKeys();
};

// Atomic cache update to prevent race conditions
const atomicCacheUpdate = async (key: string, quantity: number, metadata?: any): Promise<void> => {
  const mutex = getMutexForKey(`cache-${key}`);
  return mutex.runExclusive(() => {
    snapshotCache.set(key, quantity, metadata);
  });
};



// Emergency verification and fix function
export const verifyAndFixStock = async (
  stockItemId: string,
  binId: string
): Promise<{ before: number; after: number; fixed: boolean }> => {
  console.log(`🔍 Verifying ${stockItemId} in ${binId}...`);

  // Get current calculated stock
  const currentResults = await calculateBulkStock([stockItemId], [binId]);
  const currentKey = `${stockItemId}-${binId}`;
  const currentStock = currentResults[currentKey] || 0;

  // Calculate from scratch using fixed logic
  const fixedStock = await calculateStockFromTransactionsFixed(
    stockItemId,
    binId,
    true
  );

  // If different, fix it
  if (Math.abs(currentStock - fixedStock) > 0.001) {
    console.log(`⚠️ Fixing ${stockItemId} in ${binId}: ${currentStock} → ${fixedStock}`);

    await updateStockSnapshot(
      stockItemId,
      binId,
      fixedStock,
      'verification_fix',
      null
    );

    return {
      before: currentStock,
      after: fixedStock,
      fixed: true
    };
  }

  return {
    before: currentStock,
    after: fixedStock,
    fixed: false
  };
};

// Use this fixed version for recalculations
const calculateStockFromTransactionsFixed = async (
  stockItemId: string,
  binId: string,
  verbose: boolean = true
): Promise<number> => {
  if (verbose) {
    console.log(`🧮 Fixed calculation for ${stockItemId} in ${binId}`);
  }

  try {
    // Get ALL transactions in proper chronological order
    const query = groq`{
      "allEvents": *[_type in ["GoodsReceipt", "DispatchLog", "InternalTransfer", "InventoryCount"] && 
        ((_type == "GoodsReceipt" && receivingBin._ref == $binId) ||
         (_type == "DispatchLog" && sourceBin._ref == $binId) ||
         (_type == "InternalTransfer" && (fromBin._ref == $binId || toBin._ref == $binId)) ||
         (_type == "InventoryCount" && bin._ref == $binId))
      ] | order(date asc) {
        _type,
        "date": coalesce(receiptDate, dispatchDate, transferDate, countDate),
        "fromBinId": ^.fromBin._ref,
        "toBinId": ^.toBin._ref,
        receivedItems[] {
          "itemId": stockItem._ref,
          "quantity": receivedQuantity
        },
        dispatchedItems[] {
          "itemId": stockItem._ref,
          "quantity": dispatchedQuantity
        },
        transferredItems[] {
          "itemId": stockItem._ref,
          "quantity": transferredQuantity
        },
        countedItems[] {
          "itemId": stockItem._ref,
          "quantity": countedQuantity
        }
      }
    }`;

    const data = await client.fetch(query, { binId, stockItemId });

    let stock = new Decimal(0);
    let lastCountDate: Date | null = null;

    // Process in strict chronological order
    data.allEvents?.forEach((event: any) => {
      const eventDate = new Date(event.date);

      // Skip if before last inventory count
      if (lastCountDate && eventDate < lastCountDate) {
        return;
      }

      // Process goods receipts
      event.receivedItems?.forEach((item: any) => {
        if (item.itemId === stockItemId) {
          stock = stock.plus(item.quantity || 0);
        }
      });

      // Process dispatches
      event.dispatchedItems?.forEach((item: any) => {
        if (item.itemId === stockItemId) {
          // Prevent negative stock
          const dispatchQty = new Decimal(item.quantity || 0);
          stock = stock.minus(dispatchQty);
        }
      });

      // Process transfers
      event.transferredItems?.forEach((item: any) => {
        if (item.itemId === stockItemId) {
          // Transfer OUT from this bin
          if (event.fromBinId === binId) {
            const transferQty = new Decimal(item.quantity || 0);
            stock = stock.minus(transferQty);
          }
          // Transfer IN to this bin
          if (event.toBinId === binId) {
            stock = stock.plus(item.quantity || 0);
          }
        }
      });

      // Process inventory counts
      event.countedItems?.forEach((item: any) => {
        if (item.itemId === stockItemId) {
          // Count SETS the absolute stock
          stock = new Decimal(item.quantity || 0);
          lastCountDate = eventDate;
        }
      });
    });

    const finalStock = stock.toNumber();

    if (verbose) {
      console.log(`✅ Fixed calculation: ${finalStock}`);
      if (lastCountDate !== null && lastCountDate !== undefined) {
        const date: Date = lastCountDate;

        // Check if it's a valid date before calling toISOString
        if (!isNaN(date.getTime())) {
          console.log(`   📅 Last inventory count: ${date.toISOString().split('T')[0]}`);
        } else {
          console.log(`   📅 Last inventory count: Invalid date`);
        }
      }
    }

    return finalStock;

  } catch (error) {
    console.error('Error in fixed calculation:', error);
    return 0;
  }
};

// Update the existing emergency function to use this fixed version
export const emergencyRecalculateAllStock = async (): Promise<void> => {
  console.log('🚨 Emergency recalculating ALL stock...');

  // Get all bins
  const bins = await client.fetch(groq`*[_type == "Bin"] { _id, name }`);
  // Get all stock items
  const items = await client.fetch(groq`*[_type == "StockItem"] { _id, name }`);

  let fixed = 0;
  let errors = 0;

  for (const bin of bins) {
    console.log(`📦 Processing bin: ${bin.name}`);

    for (const item of items) {
      try {
        // Use the FIXED calculation
        const stock = await calculateStockFromTransactionsFixed(
          item._id,
          bin._id,
          false
        );

        // Update snapshot
        await updateStockSnapshot(
          item._id,
          bin._id,
          stock,
          'emergency_fix',
          null
        );

        fixed++;

        if (fixed % 50 === 0) {
          console.log(`  Fixed ${fixed} items...`);
        }

      } catch (error) {
        errors++;
        console.error(`❌ Error fixing ${item.name} in ${bin.name}:`, error);
      }
    }
  }

  console.log(`✅ Emergency fix complete: ${fixed} fixed, ${errors} errors`);
};



// 18. Diagnostic tool for stock calculation analysis
export const auditStockCalculations = async (
  stockItemId: string,
  binId: string
): Promise<{
  rawTransactions: any[];
  chronologicalCalculation: number;
  snapshotCalculation: number;
  differences: Array<{
    date: string;
    transaction: string;
    impact: number;
    cumulative: number;
    notes?: string;
  }>;
  issues: string[];
}> => {
  console.log(`🔍 Auditing ${stockItemId} in ${binId} (ALLOWING NEGATIVES)`);

  const issues: string[] = [];

  // 1. Get raw transaction data
  const rawData = await client.fetch(groq`{
    "goodsReceipts": *[_type == "GoodsReceipt" && receivingBin._ref == $binId] | order(receiptDate asc) {
      _id,
      receiptDate,
      receiptNumber,
      status,
      receivedItems[] {
        "itemId": stockItem._ref,
        receivedQuantity
      }
    },
    "dispatches": *[_type == "DispatchLog" && sourceBin._ref == $binId] | order(dispatchDate asc) {
      _id,
      dispatchDate,
      dispatchNumber,
      evidenceStatus,
      status,
      dispatchedItems[] {
        "itemId": stockItem._ref,
        dispatchedQuantity
      }
    },
    "transfers": *[_type == "InternalTransfer" && (fromBin._ref == $binId || toBin._ref == $binId)] | order(transferDate asc) {
      _id,
      transferDate,
      transferNumber,
      status,
      "fromBinId": fromBin._ref,
      "toBinId": toBin._ref,
      transferredItems[] {
        "itemId": stockItem._ref,
        transferredQuantity
      }
    },
    "counts": *[_type == "InventoryCount" && bin._ref == $binId] | order(countDate asc) {
      _id,
      countDate,
      countNumber,
      status,
      countedItems[] {
        "itemId": stockItem._ref,
        countedQuantity
      }
    }
  }`, { binId, stockItemId });

  // 2. Flatten and sort all transactions
  const allTransactions: Array<{
    date: Date;
    type: 'receipt' | 'dispatch' | 'transferOut' | 'transferIn' | 'count';
    documentId: string;
    documentNumber: string;
    quantity: number;
    status: string;
  }> = [];

  // Process goods receipts
  rawData.goodsReceipts?.forEach((receipt: any) => {
    receipt.receivedItems?.forEach((item: any) => {
      if (item.itemId === stockItemId) {
        allTransactions.push({
          date: new Date(receipt.receiptDate),
          type: 'receipt',
          documentId: receipt._id,
          documentNumber: receipt.receiptNumber,
          quantity: item.receivedQuantity || 0,
          status: receipt.status
        });
      }
    });
  });

  // Process dispatches
  rawData.dispatches?.forEach((dispatch: any) => {
    dispatch.dispatchedItems?.forEach((item: any) => {
      if (item.itemId === stockItemId) {
        allTransactions.push({
          date: new Date(dispatch.dispatchDate),
          type: 'dispatch',
          documentId: dispatch._id,
          documentNumber: dispatch.dispatchNumber,
          quantity: -(item.dispatchedQuantity || 0),
          status: dispatch.evidenceStatus || dispatch.status
        });
      }
    });
  });

  // Process transfers
  rawData.transfers?.forEach((transfer: any) => {
    transfer.transferredItems?.forEach((item: any) => {
      if (item.itemId === stockItemId) {
        // Transfer OUT from this bin
        if (transfer.fromBinId === binId) {
          allTransactions.push({
            date: new Date(transfer.transferDate),
            type: 'transferOut',
            documentId: transfer._id,
            documentNumber: transfer.transferNumber,
            quantity: -(item.transferredQuantity || 0),
            status: transfer.status
          });
        }
        // Transfer IN to this bin
        if (transfer.toBinId === binId) {
          allTransactions.push({
            date: new Date(transfer.transferDate),
            type: 'transferIn',
            documentId: transfer._id,
            documentNumber: transfer.transferNumber,
            quantity: item.transferredQuantity || 0,
            status: transfer.status
          });
        }
      }
    });
  });

  // Process inventory counts
  rawData.counts?.forEach((count: any) => {
    count.countedItems?.forEach((item: any) => {
      if (item.itemId === stockItemId) {
        allTransactions.push({
          date: new Date(count.countDate),
          type: 'count',
          documentId: count._id,
          documentNumber: count.countNumber,
          quantity: item.countedQuantity || 0,
          status: count.status
        });
      }
    });
  });

  // Sort by date
  allTransactions.sort((a, b) => a.date.getTime() - b.date.getTime());

  // 3. Calculate chronologically (with proper inventory count logic)
  let chronologicalStock = 0;
  const differences: { date: string; transaction: string; impact: number; cumulative: number; notes: string | undefined; }[] = [];
  const countTimeline: Array<{ date: Date; quantity: number }> = [];

  // First pass: collect inventory counts
  allTransactions.forEach(tx => {
    if (tx.type === 'count') {
      countTimeline.push({ date: tx.date, quantity: tx.quantity });
    }
  });

  // Second pass: process all transactions
  allTransactions.forEach((tx) => {
    const stockBefore = chronologicalStock;

    // Find the most recent count that happened ON or BEFORE this transaction
    let applicableCount: number | null = null;
    let applicableCountDate: Date | null = null;

    for (let i = countTimeline.length - 1; i >= 0; i--) {
      if (countTimeline[i].date <= tx.date) {
        applicableCount = countTimeline[i].quantity;
        applicableCountDate = countTimeline[i].date;
        break;
      }
    }

    if (tx.type === 'count') {
      // Count sets the absolute stock
      chronologicalStock = tx.quantity;
      differences.push({
        date: tx.date.toISOString(),
        transaction: `${tx.type} #${tx.documentNumber}`,
        impact: tx.quantity - stockBefore,
        cumulative: chronologicalStock,
        notes: `RESET: Count sets stock to ${tx.quantity}`
      });
    } else if (applicableCountDate === null || tx.date > applicableCountDate) {
      // Transaction happens AFTER the most recent count (or no count yet)
      chronologicalStock += tx.quantity;
      differences.push({
        date: tx.date.toISOString(),
        transaction: `${tx.type} #${tx.documentNumber}`,
        impact: tx.quantity,
        cumulative: chronologicalStock,
        notes: tx.quantity < 0 ? `Negative allowed for analysis` : undefined
      });
    } else {
      // Transaction happened BEFORE the most recent count - should be ignored
      differences.push({
        date: tx.date.toISOString(),
        transaction: `${tx.type} #${tx.documentNumber}`,
        impact: tx.quantity,
        cumulative: chronologicalStock,
        notes: `IGNORED: Happened before count on ${applicableCountDate.toISOString().split('T')[0]}`
      });
    }

    // Check for data quality issues
    if (tx.status && !['completed', 'complete', 'processed'].includes(tx.status)) {
      issues.push(`Transaction ${tx.type} #${tx.documentNumber} has status "${tx.status}" - might be excluded from calculations`);
    }
  });

  // 4. Get current snapshot calculation for comparison
  const snapshotResult = await calculateStock(stockItemId, binId);

  // 5. Identify discrepancies
  if (Math.abs(chronologicalStock - snapshotResult.quantity) > 0.01) {
    issues.push(`CALCULATION MISMATCH: Chronological=${chronologicalStock}, Snapshot=${snapshotResult.quantity}, Difference=${chronologicalStock - snapshotResult.quantity}`);
  }

  // 6. Check for negative stock patterns
  if (chronologicalStock < 0) {
    const negativeTransactions = differences.filter(d => d.cumulative < 0);
    if (negativeTransactions.length > 0) {
      issues.push(`NEGATIVE STOCK DETECTED: ${chronologicalStock} units missing. Check transactions around ${negativeTransactions[0].date}`);
    }
  }

  return {
    rawTransactions: allTransactions,
    chronologicalCalculation: chronologicalStock,
    snapshotCalculation: snapshotResult.quantity,
    differences,
    issues
  };
};








// Add to exports section at the bottom or near other export functions:
export const getStockTransactionHistory = auditStockCalculations;