// src/lib/stockCalculations.ts
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';
import Decimal from 'decimal.js';

export const calculateStock = async (stockItemId: string, binId: string): Promise<number> => {
  try {
    console.log(`🧮 Calculating stock for item ${stockItemId} in bin ${binId}`);

    if (!stockItemId || !binId) {
      console.log('⚠️ Missing itemId or binId');
      return 0;
    }

    const results = await calculateBulkStock([stockItemId], [binId]);
    const key = `${stockItemId}-${binId}`;
    const quantity = results[key] || 0;

    console.log(`✅ Stock for ${key}: ${quantity}`);
    return quantity;
  } catch (error) {
    console.error('❌ Error calculating stock:', error);
    return 0;
  }
};

export const calculateBulkStock = async (stockItemIds: string[], binIds: string[]): Promise<{ [key: string]: number }> => {
  console.log('🧮 Starting calculateBulkStock...');
  console.log('📦 Stock Item IDs:', stockItemIds.length);
  console.log('🗄️ Bin IDs:', binIds.length);

  if (stockItemIds.length === 0 || binIds.length === 0) {
    console.log('⚠️ No items or bins provided');
    return {};
  }

  try {
    // CORRECTED QUERY based on your actual APIs
    const query = groq`{
      "counts": *[_type == "InventoryCount" && bin._ref in $binIds] | order(countDate desc) {
        _id,
        bin->{ _id },
        countDate,
        countedItems[] {
          stockItem->{ _id },
          countedQuantity
        }
      },
      "goodsReceipts": *[_type == "GoodsReceipt" && receivingBin._ref in $binIds] | order(receiptDate asc) {
        _type,
        _id,
        receiptDate,
        receivingBin->{ _id },
        receivedItems[] {
          stockItem->{ _id },
          receivedQuantity
        }
      },
      "dispatches": *[_type == "DispatchLog" && sourceBin._ref in $binIds] | order(dispatchDate asc) {
        _type,
        _id,
        dispatchDate,
        sourceBin->{ _id },
        dispatchedItems[] {
          stockItem->{ _id },
          dispatchedQuantity
        }
      },
      "transfers": *[_type == "InternalTransfer" && status == "completed" && (fromBin._ref in $binIds || toBin._ref in $binIds)] | order(transferDate asc) {
        _type,
        _id,
        transferDate,
        fromBin->{ _id },
        toBin->{ _id },
        transferredItems[] {
          stockItem->{ _id },
          transferredQuantity
        }
      }
      // Removed StockAdjustment since it doesn't exist in your APIs
    }`;

    console.log('📡 Fetching data from Sanity...');
    const data = await client.fetch(query, { binIds, stockItemIds });

    console.log('📊 Data counts from Sanity:');
    console.log('- Inventory Counts:', data.counts?.length || 0);
    console.log('- Goods Receipts:', data.goodsReceipts?.length || 0);
    console.log('- Dispatches:', data.dispatches?.length || 0);
    console.log('- Transfers:', data.transfers?.length || 0);

    // Step 1: Initialize results
    const results: { [key: string]: Decimal } = {};

    // Initialize all possible combinations with 0
    binIds.forEach(binId => {
      stockItemIds.forEach(itemId => {
        const key = `${itemId}-${binId}`;
        results[key] = new Decimal(0);
      });
    });

    // Step 2: Apply inventory counts (most recent per bin)
    console.log('📈 Applying inventory counts...');
    const latestCountsByBin: { [binId: string]: any } = {};

    data.counts?.forEach((count: any) => {
      const binId = count.bin?._id;
      if (!binId) return;

      const countDate = new Date(count.countDate);
      if (!latestCountsByBin[binId] || countDate > new Date(latestCountsByBin[binId].countDate)) {
        latestCountsByBin[binId] = count;
      }
    });

    Object.entries(latestCountsByBin).forEach(([binId, count]: [string, any]) => {
      count.countedItems?.forEach((item: any) => {
        const itemId = item.stockItem?._id;
        if (itemId && stockItemIds.includes(itemId)) {
          const key = `${itemId}-${binId}`;
          results[key] = new Decimal(item.countedQuantity || 0);
          console.log(`  📝 Set ${key} = ${item.countedQuantity} from inventory count`);
        }
      });
    });

    // Step 3: Apply Goods Receipts (ADD stock)
    console.log('📥 Applying goods receipts...');
    data.goodsReceipts?.forEach((receipt: any, index: number) => {
      const binId = receipt.receivingBin?._id;
      if (!binId) return;

      receipt.receivedItems?.forEach((item: any) => {
        const itemId = item.stockItem?._id;
        if (itemId && stockItemIds.includes(itemId)) {
          const key = `${itemId}-${binId}`;
          const quantity = item.receivedQuantity || 0;
          results[key] = results[key].plus(new Decimal(quantity));
          console.log(`  ${index + 1}. +${quantity} to ${key} (GoodsReceipt: ${receipt._id})`);
        }
      });
    });

    // Step 4: Apply Dispatches (SUBTRACT stock)
    console.log('📤 Applying dispatches...');
    data.dispatches?.forEach((dispatch: any, index: number) => {
      const binId = dispatch.sourceBin?._id;
      if (!binId) return;

      dispatch.dispatchedItems?.forEach((item: any) => {
        const itemId = item.stockItem?._id;
        if (itemId && stockItemIds.includes(itemId)) {
          const key = `${itemId}-${binId}`;
          const quantity = item.dispatchedQuantity || 0;
          results[key] = results[key].minus(new Decimal(quantity));
          console.log(`  ${index + 1}. -${quantity} from ${key} (Dispatch: ${dispatch._id})`);
        }
      });
    });

    // Step 5: Apply Transfers (MOVE stock between bins)
    console.log('🔄 Applying transfers...');
    data.transfers?.forEach((transfer: any, index: number) => {
      const fromBinId = transfer.fromBin?._id;
      const toBinId = transfer.toBin?._id;

      transfer.transferredItems?.forEach((item: any) => {
        const itemId = item.stockItem?._id;
        const quantity = item.transferredQuantity || 0;

        // Remove from source bin
        if (fromBinId && itemId && stockItemIds.includes(itemId)) {
          const fromKey = `${itemId}-${fromBinId}`;
          results[fromKey] = results[fromKey].minus(new Decimal(quantity));
          console.log(`  ${index + 1}. -${quantity} from ${fromKey} (Transfer out: ${transfer._id})`);
        }

        // Add to destination bin
        if (toBinId && itemId && stockItemIds.includes(itemId)) {
          const toKey = `${itemId}-${toBinId}`;
          results[toKey] = results[toKey].plus(new Decimal(quantity));
          console.log(`  ${index + 1}. +${quantity} to ${toKey} (Transfer in: ${transfer._id})`);
        }
      });
    });

    // Step 6: Convert to positive numbers and return
    const finalResults: { [key: string]: number } = {};
    for (const key in results) {
      finalResults[key] = Math.max(0, results[key].toNumber());
      if (finalResults[key] > 0) {
        console.log(`📊 Final stock for ${key}: ${finalResults[key]}`);
      }
    }

    console.log('✅ calculateBulkStock complete');
    console.log('📈 Results summary:', {
      totalCombinations: Object.keys(finalResults).length,
      nonZeroResults: Object.values(finalResults).filter(v => v > 0).length,
      allResults: finalResults
    });

    return finalResults;

  } catch (error) {
    console.error('❌ Error in calculateBulkStock:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    return {};
  }
};

export const getBinStock = async (stockItemIds: string[], binId: string): Promise<{ [key: string]: number }> => {
  console.log(`📊 Getting bin stock for ${stockItemIds.length} items in bin ${binId}`);

  if (!binId || stockItemIds.length === 0) {
    return {};
  }

  const results = await calculateBulkStock(stockItemIds, [binId]);

  // Simplify results
  const simplifiedResults: { [key: string]: number } = {};
  let foundItems = 0;

  stockItemIds.forEach(itemId => {
    const compositeKey = `${itemId}-${binId}`;
    const quantity = results[compositeKey] || 0;
    if (quantity > 0) {
      foundItems++;
      console.log(`  ✅ ${itemId}: ${quantity}`);
    }
    simplifiedResults[itemId] = quantity;
  });

  console.log(`✅ Found stock for ${foundItems}/${stockItemIds.length} items`);
  return simplifiedResults;
};