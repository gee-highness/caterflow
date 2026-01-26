import { NextRequest, NextResponse } from 'next/server';
import { calculateBulkStock } from '@/lib/stockCalculations';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';
import Decimal from 'decimal.js';
import { getUserSiteInfo } from '@/lib/siteFiltering';

// Cache for dashboard data
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds

// Helper function to get empty stats
function getEmptyStats() {
  return {
    monthlyReceiptsCount: 0,
    receiptsTrend: 0,
    monthlyDispatchesCount: 0,
    todaysDispatchesCount: 0,
    pendingActionsCount: 0,
    pendingTransfersCount: 0,
    draftOrdersCount: 0,
    lowStockItemsCount: 0,
    outOfStockItemsCount: 0,
    weeklyActivityCount: 0,
    todayActivityCount: 0,
    totalStockCount: 0
  };
}

// Fetch all sites user can access
async function fetchAllUserSites(userSiteInfo: any) {
  if (userSiteInfo.canAccessMultipleSites) {
    // Admin/auditor can access all sites
    const query = groq`*[_type == "Site"] | order(name asc) { _id, name }`;
    return await client.fetch(query);
  } else if (userSiteInfo.userSiteId) {
    // Site manager can only access their site
    const query = groq`*[_type == "Site" && _id == $siteId] { _id, name }`;
    return await client.fetch(query, { siteId: userSiteInfo.userSiteId });
  }
  return [];
}

// Main POST function with legacy support
export async function POST(request: NextRequest) {
  try {
    const { siteIds } = await request.json();
    const userSiteInfo = await getUserSiteInfo(request);

    console.log('🔐 User site info:', {
      canAccessMultipleSites: userSiteInfo.canAccessMultipleSites,
      userSiteId: userSiteInfo.userSiteId,
      requestedSiteIds: siteIds
    });

    // Determine which site IDs the user is allowed to access
    let allowedSiteIds: string[] = [];

    if (userSiteInfo.canAccessMultipleSites) {
      // Admin/auditor can access all requested sites or all sites if none specified
      if (siteIds && Array.isArray(siteIds) && siteIds.length > 0) {
        allowedSiteIds = siteIds;
      } else {
        // If no sites specified, fetch all sites user can access
        const allSites = await fetchAllUserSites(userSiteInfo);
        allowedSiteIds = allSites.map((site: { _id: any; }) => site._id);
      }
    } else if (userSiteInfo.userSiteId) {
      // Site manager - can only access their associated site
      allowedSiteIds = [userSiteInfo.userSiteId];
    } else {
      // User with no site access
      allowedSiteIds = [];
    }

    console.log('✅ Final allowed site IDs:', allowedSiteIds);

    if (allowedSiteIds.length === 0) {
      // Return empty data for users with no site access
      return NextResponse.json({
        transactions: [],
        stats: getEmptyStats()
      });
    }

    // Check cache with allowed site IDs
    const cacheKey = JSON.stringify(allowedSiteIds.sort());
    const cachedData = cache.get(cacheKey);

    if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL) {
      return NextResponse.json(cachedData.data);
    }

    // Get current date for time-based queries
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // Fetch all needed data in parallel using allowed site IDs
    const [
      transactions,
      stockItems,
      bins,
      monthlyReceiptsCount,
      monthlyDispatchesCount,
      todaysDispatchesCount,
      pendingTransfersCount,
      draftOrdersCount,
      weeklyActivityCount,
      todayActivityCount,
      totalStockCount
    ] = await Promise.all([
      fetchTransactions(allowedSiteIds),
      fetchStockItems(),
      fetchBins(allowedSiteIds),
      countMonthlyReceipts(allowedSiteIds, startOfMonth),
      countMonthlyDispatches(allowedSiteIds, startOfMonth),
      countTodaysDispatches(allowedSiteIds, startOfToday),
      countPendingTransfers(allowedSiteIds),
      countDraftOrders(allowedSiteIds),
      countWeeklyActivity(allowedSiteIds, startOfWeek),
      countTodayActivity(allowedSiteIds, startOfToday),
      calculateTotalStockCount(allowedSiteIds)
    ]);

    // Calculate low stock items
    const [lowStockItemsCount, outOfStockItemsCount] = await calculateLowStockCounts(stockItems, bins, allowedSiteIds);

    const result = {
      transactions,
      stats: {
        // Card 1: Receipts This Month
        monthlyReceiptsCount,
        receiptsTrend: await calculateReceiptsTrend(allowedSiteIds, startOfMonth),

        // Card 2: Dispatches This Month
        monthlyDispatchesCount,
        todaysDispatchesCount,

        // Card 3: Pending Actions
        pendingActionsCount: pendingTransfersCount + draftOrdersCount,
        pendingTransfersCount,
        draftOrdersCount,

        // Card 4: Low Stock Items
        lowStockItemsCount,
        outOfStockItemsCount,

        // Card 5: Recent Activity
        weeklyActivityCount,
        todayActivityCount,

        // Card 6: Total Stock Count
        totalStockCount
      }
    };

    // Cache the result
    cache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate dashboard stats' },
      { status: 500 }
    );
  }
}

// Original low stock calculation method
async function calculateLowStockCounts(stockItems: any[], bins: any[], siteIds: string[]) {
  // Filter bins to only include those from selected sites
  const relevantBins = bins.filter(bin => siteIds.includes(bin.siteId));

  const stockItemIds = stockItems.map(item => item._id);
  const binIds = relevantBins.map(bin => bin._id);

  if (stockItemIds.length === 0 || binIds.length === 0) {
    return [0, 0];
  }

  // Use bulk calculation from original code
  const stockQuantities = await calculateBulkStock(stockItemIds, binIds);

  let lowStockCount = 0;
  let outOfStockCount = 0;

  stockItems.forEach(item => {
    let totalQuantity = new Decimal(0);

    relevantBins.forEach(bin => {
      const key = `${item._id}-${bin._id}`;
      totalQuantity = totalQuantity.plus(new Decimal(stockQuantities[key] || 0));
    });

    const totalQty = totalQuantity.toNumber();

    if (totalQty <= item.minimumStockLevel) {
      lowStockCount++;
    }

    if (totalQty === 0) {
      outOfStockCount++;
    }
  });

  return [lowStockCount, outOfStockCount];
}

// LEGACY-SUPPORTING TRANSACTION FETCH
async function fetchTransactions(siteIds: string[]) {
  if (siteIds.length === 0) return [];

  // COMPREHENSIVE query that handles ALL cases:
  // 1. Old GoodsReceipts with only document-level receivingBin
  // 2. New GoodsReceipts with purchaseOrder->site reference
  // 3. Old DispatchLogs with only document-level sourceBin
  // 4. New DispatchLogs with sourceSite reference
  // 5. InternalTransfers with fromBin/toBin
  const query = groq`*[_type in ["GoodsReceipt", "DispatchLog", "InternalTransfer"] 
    && (
      // CASE 1: Old GoodsReceipts - document-level receivingBin
      (_type == "GoodsReceipt" && defined(receivingBin) && receivingBin->site._ref in $siteIds) ||
      
      // CASE 2: New GoodsReceipts - purchaseOrder->site
      (_type == "GoodsReceipt" && defined(purchaseOrder) && purchaseOrder->site._ref in $siteIds) ||
      
      // CASE 3: Old DispatchLogs - document-level sourceBin
      (_type == "DispatchLog" && defined(sourceBin) && sourceBin->site._ref in $siteIds) ||
      
      // CASE 4: New DispatchLogs - sourceSite reference
      (_type == "DispatchLog" && defined(sourceSite) && sourceSite._ref in $siteIds) ||
      
      // CASE 5: InternalTransfers
      (_type == "InternalTransfer" && 
        (fromBin->site._ref in $siteIds || toBin->site._ref in $siteIds))
    )
  ] | order(_updatedAt desc) [0..10] {
    _id,
    _type,
    "createdAt": coalesce(receiptDate, dispatchDate, transferDate),
    "description": coalesce("Receipt: " + receiptNumber, "Dispatch: " + dispatchNumber, "Transfer: " + transferNumber),
    "siteName": coalesce(
      // For GoodsReceipts - try purchaseOrder site first, then receivingBin site
      purchaseOrder->site->name,
      receivingBin->site->name,
      // For DispatchLogs - try sourceSite first, then sourceBin site
      sourceSite->name,
      sourceBin->site->name,
      // For InternalTransfers - fromBin site
      fromBin->site->name
    )
  }`;

  const transactions = await client.fetch(query, { siteIds });

  // Process and deduplicate transactions (some might appear twice due to multiple conditions)
  const seenIds = new Set();
  const uniqueTransactions = [];

  for (const tx of transactions) {
    if (!seenIds.has(tx._id)) {
      seenIds.add(tx._id);
      uniqueTransactions.push(tx);
    }
  }

  return uniqueTransactions.slice(0, 10);
}

async function fetchStockItems() {
  const query = groq`*[_type == "StockItem"] {
    _id,
    name,
    minimumStockLevel,
    unitOfMeasure
  }`;
  return await client.fetch(query);
}

async function fetchBins(siteIds: string[]) {
  if (siteIds.length === 0) return [];

  const query = groq`*[_type == "Bin" && site._ref in $siteIds] {
    _id,
    "siteId": site._ref
  }`;
  return await client.fetch(query, { siteIds });
}

// COMPREHENSIVE MONTHLY RECEIPTS COUNT (LEGACY + NEW)
async function countMonthlyReceipts(siteIds: string[], startOfMonth: string) {
  if (siteIds.length === 0) return 0;

  // Count receipts that are either:
  // 1. Old format: document-level receivingBin for the site
  // 2. New format: purchaseOrder->site for the site
  // 3. Item-level: any receivedItems with receivingBin for the site
  const query = groq`count(*[
    _type == "GoodsReceipt" && 
    receiptDate >= $startOfMonth &&
    (
      // Old format: document-level receivingBin
      (defined(receivingBin) && receivingBin->site._ref in $siteIds) ||
      
      // New format: purchaseOrder site
      (defined(purchaseOrder) && purchaseOrder->site._ref in $siteIds) ||
      
      // Item-level bins
      count(receivedItems[defined(receivingBin) && receivingBin->site._ref in $siteIds]) > 0
    )
  ])`;

  return await client.fetch(query, { siteIds, startOfMonth });
}

// COMPREHENSIVE MONTHLY DISPATCHES COUNT (LEGACY + NEW)
async function countMonthlyDispatches(siteIds: string[], startOfMonth: string) {
  if (siteIds.length === 0) return 0;

  // Count dispatches that are either:
  // 1. Old format: document-level sourceBin for the site
  // 2. New format: sourceSite reference for the site
  // 3. Item-level: any dispatchedItems with sourceBin for the site
  const query = groq`count(*[
    _type == "DispatchLog" && 
    dispatchDate >= $startOfMonth &&
    (
      // Old format: document-level sourceBin
      (defined(sourceBin) && sourceBin->site._ref in $siteIds) ||
      
      // New format: sourceSite reference
      (defined(sourceSite) && sourceSite._ref in $siteIds) ||
      
      // Item-level bins
      count(dispatchedItems[defined(sourceBin) && sourceBin->site._ref in $siteIds]) > 0
    )
  ])`;

  return await client.fetch(query, { siteIds, startOfMonth });
}

// TODAY'S DISPATCHES COUNT (ONLY PENDING/NOT COMPLETED)
async function countTodaysDispatches(siteIds: string[], startOfToday: string) {
  if (siteIds.length === 0) return 0;

  const query = groq`count(*[
    _type == "DispatchLog" && 
    dispatchDate >= $startOfToday &&
    status != "completed" &&
    (
      // Old format: document-level sourceBin
      (defined(sourceBin) && sourceBin->site._ref in $siteIds) ||
      
      // New format: sourceSite reference
      (defined(sourceSite) && sourceSite._ref in $siteIds) ||
      
      // Item-level bins
      count(dispatchedItems[defined(sourceBin) && sourceBin->site._ref in $siteIds]) > 0
    )
  ])`;

  return await client.fetch(query, { siteIds, startOfToday });
}

async function countPendingTransfers(siteIds: string[]) {
  if (siteIds.length === 0) return 0;

  const query = groq`count(*[
    _type == "InternalTransfer" && 
    (fromBin->site._ref in $siteIds || toBin->site._ref in $siteIds) &&
    status == "pending"
  ])`;
  return await client.fetch(query, { siteIds });
}

async function countDraftOrders(siteIds: string[]) {
  if (siteIds.length === 0) return 0;

  // Draft orders don't have site filtering in your current schema
  // They're visible to all with appropriate role
  const query = groq`count(*[
    _type == "PurchaseOrder" && 
    status == "draft"
  ])`;
  return await client.fetch(query);
}

// COMPREHENSIVE WEEKLY ACTIVITY COUNT
async function countWeeklyActivity(siteIds: string[], startOfWeek: string) {
  if (siteIds.length === 0) return 0;

  const query = groq`count(*[
    _type in ["GoodsReceipt", "DispatchLog", "InternalTransfer"] &&
    (
      // GoodsReceipts - all formats
      (_type == "GoodsReceipt" && (
        (defined(receivingBin) && receivingBin->site._ref in $siteIds) ||
        (defined(purchaseOrder) && purchaseOrder->site._ref in $siteIds) ||
        count(receivedItems[defined(receivingBin) && receivingBin->site._ref in $siteIds]) > 0
      )) ||
      
      // DispatchLogs - all formats
      (_type == "DispatchLog" && (
        (defined(sourceBin) && sourceBin->site._ref in $siteIds) ||
        (defined(sourceSite) && sourceSite._ref in $siteIds) ||
        count(dispatchedItems[defined(sourceBin) && sourceBin->site._ref in $siteIds]) > 0
      )) ||
      
      // InternalTransfers
      (_type == "InternalTransfer" && 
        (fromBin->site._ref in $siteIds || toBin->site._ref in $siteIds)) ||
    ) &&
    coalesce(receiptDate, dispatchDate, transferDate, adjustmentDate) >= $startOfWeek
  ])`;

  return await client.fetch(query, { siteIds, startOfWeek });
}

// COMPREHENSIVE TODAY ACTIVITY COUNT
async function countTodayActivity(siteIds: string[], startOfToday: string) {
  if (siteIds.length === 0) return 0;

  const query = groq`count(*[
    _type in ["GoodsReceipt", "DispatchLog", "InternalTransfer", "StockAdjustment"] &&
    (
      // GoodsReceipts - all formats
      (_type == "GoodsReceipt" && (
        (defined(receivingBin) && receivingBin->site._ref in $siteIds) ||
        (defined(purchaseOrder) && purchaseOrder->site._ref in $siteIds) ||
        count(receivedItems[defined(receivingBin) && receivingBin->site._ref in $siteIds]) > 0
      )) ||
      
      // DispatchLogs - all formats
      (_type == "DispatchLog" && (
        (defined(sourceBin) && sourceBin->site._ref in $siteIds) ||
        (defined(sourceSite) && sourceSite._ref in $siteIds) ||
        count(dispatchedItems[defined(sourceBin) && sourceBin->site._ref in $siteIds]) > 0
      )) ||
      
      // InternalTransfers
      (_type == "InternalTransfer" && 
        (fromBin->site._ref in $siteIds || toBin->site._ref in $siteIds)) ||
      
      // StockAdjustments
      (_type == "StockAdjustment" && bin->site._ref in $siteIds)
    ) &&
    coalesce(receiptDate, dispatchDate, transferDate, adjustmentDate) >= $startOfToday
  ])`;

  return await client.fetch(query, { siteIds, startOfToday });
}

// TOTAL STOCK COUNT (simple count of stock items)
async function calculateTotalStockCount(siteIds: string[]): Promise<number> {
  if (siteIds.length === 0) return 0;

  try {
    // Count stock items that are associated with bins at the given sites
    // This is a simplified count - in reality you might want to count unique stock items
    // that have stock in bins at these sites

    const query = groq`count(*[_type == "StockItem"])`;
    return await client.fetch(query);
  } catch (error) {
    console.error('Error counting stock items:', error);
    return 0;
  }
}

// RECEIPTS TREND CALCULATION
async function calculateReceiptsTrend(siteIds: string[], startOfMonth: string) {
  if (siteIds.length === 0) return 0;

  // Calculate previous month for comparison
  const prevMonth = new Date(startOfMonth);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const startOfPrevMonth = prevMonth.toISOString();

  const [currentMonthCount, previousMonthCount] = await Promise.all([
    countMonthlyReceipts(siteIds, startOfMonth),
    countMonthlyReceipts(siteIds, startOfPrevMonth)
  ]);

  return Math.max(0, currentMonthCount - previousMonthCount);
}

// ENHANCED: Get site names for better transaction display
async function getSiteNamesForTransactions(transactions: any[], siteIds: string[]) {
  if (transactions.length === 0 || siteIds.length === 0) {
    return transactions;
  }

  // Get site names
  const siteQuery = groq`*[_type == "Site" && _id in $siteIds] {
    _id,
    name
  }`;

  const sites = await client.fetch(siteQuery, { siteIds });
  const siteMap = new Map(sites.map((site: any) => [site._id, site.name]));

  // Enhance transactions with site names
  return transactions.map(tx => ({
    ...tx,
    siteName: tx.siteName || siteMap.get(tx.siteId) || 'Unknown Site'
  }));
}

/**
 *  // StockAdjustments
(_type == "StockAdjustment" && bin->site._ref in $siteIds)
 */