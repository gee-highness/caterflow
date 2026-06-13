# Stock Calculation Debug Guide

## How to Diagnose the "Items Not Adding Up" Bug

### Step 1: Enable Detailed Logging

The system already has console.log statements throughout the stock calculation pipeline. Check browser DevTools Console for:

**When goods receipt is completed:**

```
🔧 Complete goods receipt request:
```

**When stock is updated:**

```
📊 Updating stock snapshots for procurement: [receiptId]
📋 Processing X procurement items for receipt [receiptNumber]
```

**When stock is calculated:**

```
📊 Batch fetching current stock for X items in bin [binId]
📊 Processing X transactions...
✅ Calculated X items for bin [binId]: X (Xms)
```

### Step 2: Follow the Transaction Flow

#### For Goods Receipt:

1. User fills in quantities and clicks "Complete"
2. Request sent to `/api/complete-goods-receipt`
3. `updateStockForTransaction('procurement', receiptId)` called
4. Items are loaded: `receivedQuantity` from receipt
5. Bulk update created with `isAbsolute=false` (ADJUSTMENT mode)
6. Updates go to `bulkUpdateStockSnapshots` → `bulkUpdateStockRegistry`

#### For Inventory Count:

1. User fills in counted quantities and clicks "Finalize"
2. Request sent to `/api/bin-counts` (PUT)
3. Item quantities are saved with `variance` calculated:
   ```
   variance = countedQuantity - systemQuantityAtCountTime
   ```
4. **NO automatic stock update on save** (count is just stored)
5. Stock update only happens if explicitly triggered or recalculated

### Step 3: Verify Stock Snapshots

Open browser Console and run:

```javascript
// Get the latest stock for an item
fetch("/api/stock/current?stockItemId=<ITEM_ID>&binId=<BIN_ID>")
  .then((r) => r.json())
  .then((d) => console.log("Current stock:", d.currentStock));
```

### Step 4: Check for These Specific Issues

#### Issue A: Inventory Count Setting Stock to Counted Value

**Expected:** Inventory counts should not change stock registry if they're just recording current state
**Actual:** Stock may be set to exactly the counted quantity

**To test:**

1. Goods Receipt: Add 50 items → Stock should be 50
2. Inventory Count: Count 48 items (2 were damaged) → Stock should stay 50 (or set to 48?)
3. New Goods Receipt: Add 30 items → Stock should be 80 (or 78?)

**What to look for in logs:**

```
📋 Processing X inventoryCount items for count [countNumber]
```

Check if the log shows UPDATE (not creation) of stock snapshot.

#### Issue B: Stock Registry Not Being Updated for Procurement

**Expected:** When goods receipt completed, stock registry immediately increases
**Actual:** Stock may stay old value

**To test:**

1. Check current stock BEFORE receipt completes
2. Complete receipt with 100 items
3. Check current stock AFTER receipt completes (should immediately be previous + 100)

**What to look for:**

```
✅ Stock snapshots updated
📊 Bulk created X snapshots, Y failed
```

If Y (failed) > 0, that's a problem.

#### Issue C: Stock Registry Bulk Updates Failing Silently

**Expected:** All items successfully updated
**Actual:** Some items fail to update but error is swallowed

**To test:**
Open DevTools Network tab → Filter by "bulk-current"
Look for POST requests to `/api/stock/bulk-current`
Check response JSON for:

- `success` count (should equal input item count)
- `failed` count (should be 0)
- Any item-specific errors

### Step 5: Manual Stock Recalculation

If there's a mismatch, you can force recalculation by:

1. Go to Dashboard
2. Look for "Emergency Recalculate" option (if available)
3. This recalculates stock from scratch using `calculateBulkStockFromTransactions`

### Key Functions to Monitor

| Function                             | File                      | Purpose                                   |
| ------------------------------------ | ------------------------- | ----------------------------------------- |
| `updateStockForTransaction`          | stockCalculations.ts:2542 | Updates stock after transaction completed |
| `bulkUpdateStockSnapshots`           | stockCalculations.ts:24   | Batch updates snapshots                   |
| `bulkUpdateStockRegistry`            | stockRegistryAPI.ts       | Saves to registry                         |
| `calculateBulkStock`                 | stockCalculations.ts:1735 | Reads stock (uses snapshots if available) |
| `calculateBulkStockFromTransactions` | stockCalculations.ts:2016 | Recalculates from transactions            |

### Expected Behavior After Goods Receipt

```
T1: Inventory Count finds 50 items in bin A
  → Stock registry item-binA: 50

T2: Goods Receipt of 30 items to bin A
  → updateStockForTransaction called with:
     { stockItemId, binId: binA, quantity: 30, isAbsolute: false }
  → Stock registry updated: 50 + 30 = 80

T3: BinCountModal fetches current stock
  → calculateBulkStock called
  → Reads from registry: 80 ✓

T4: Another Inventory Count finds 78 items (2 damaged in transit)
  → Stock registry updated: 78

T5: New Goods Receipt of 40 items
  → Stock registry: 78 + 40 = 118 ✓
```

### If Stock Doesn't Add Up

1. **Check registry directly**: Does it have entries for item-bin? Are the values correct?
2. **Check transaction log**: Are all receipts marked as "completed"?
3. **Check for double counts**: Is an item counted in multiple inventory counts at same time?
4. **Check bin assignments**: Are items going to wrong bin in goods receipt?

### Potential Root Causes Remaining

#### 1. Inventory Count Overwriting Subsequent Receipts

Logic: When count is processed, stock is SET to counted quantity
If a goods receipt completes BEFORE the count date, could cause issues

Fix: Ensure goods receipts AFTER counts properly add to post-count stock

#### 2. Race Condition in Bulk Updates

Multiple items updating same bin simultaneously could cause values to be lost

Fix: Use transaction-based updates or proper locking

#### 3. Stock Registry Corruption

If registry gets corrupted or has gaps, calculations will be wrong

Fix: Need periodic validation/repair function

#### 4. BinCountModal Using Cached Stock

If stock is cached and not invalidated after receipt completion, user sees stale value

Fix: Ensure cache invalidation on transaction completion

---

## Testing Script (Paste in Browser Console)

```javascript
// Test scenario: Goods receipt + Bin count
async function testStockAccuracy() {
  const itemId = "YOUR_ITEM_ID";
  const binId = "YOUR_BIN_ID";

  // 1. Get initial stock
  const stock1 = await fetch(
    `/api/stock/current?stockItemId=${itemId}&binId=${binId}`,
  )
    .then((r) => r.json())
    .then((d) => d.currentStock);
  console.log("Initial stock:", stock1);

  // 2. Simulate: Complete goods receipt of 50 items
  // (Do this manually in UI)

  // 3. Wait 2 seconds for update to process
  await new Promise((r) => setTimeout(r, 2000));

  // 4. Get stock after receipt
  const stock2 = await fetch(
    `/api/stock/current?stockItemId=${itemId}&binId=${binId}`,
  )
    .then((r) => r.json())
    .then((d) => d.currentStock);
  console.log("Stock after receipt:", stock2);
  console.log(
    "Expected:",
    stock1 + 50,
    "Actual:",
    stock2,
    "Match:",
    stock1 + 50 === stock2,
  );
}

testStockAccuracy();
```
