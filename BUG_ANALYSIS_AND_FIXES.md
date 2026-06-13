# Bug Analysis and Fixes - Caterflow Stock Management

## Status: In Progress - ✅ Partial Resolution

Generated: April 20, 2026

---

## Bug #1: BinCountModal Showing "No Price" Badge

### Root Cause Identified ✅

The issue was **NOT** in the modal display or Sanity data retrieval, but in the **StockItemModal component failing to capture unitPrice when creating/editing items**.

### Chain of Issues:

1. **StockItemModal** didn't have a unitPrice input field
2. API route `/api/stock-items` wasn't validating or storing unitPrice
3. When items were created without unitPrice set, the price remained null in Sanity
4. BinCountModal correctly detected this and showed "No Price" badge

### ✅ Fixes Applied:

#### 1. StockItemModal Component

- **Added** unitPrice state: `const [unitPrice, setUnitPrice] = useState(0)`
- **Added** unitPrice initialization in useEffect when loading items: `setUnitPrice(item.unitPrice || 0)`
- **Added** unitPrice reset in new item form: `setUnitPrice(0)`
- **Added** unitPrice to API payload: `unitPrice` field in JSON.stringify
- **Added** Unit Price form field with NumberInput component
  - Precision: 2 decimal places
  - Min: 0
  - Step: 0.01 naira

#### 2. Stock Items API Route

- **POST handler**:
  - Added unitPrice validation: `unitPrice === undefined || unitPrice === null`
  - Included unitPrice in document creation: `unitPrice: Number(unitPrice) || 0`
- **PUT handler**:
  - Added unitPrice validation in both old and new code
  - Included unitPrice in document update

#### 3. API GET Method

- Already correctly fetching unitPrice from Sanity schema ✅

### How This Fixes the Bug:

```
Before: Item created → No unitPrice field in modal → Stored as null → BinCountModal shows "No Price"
After:  Item created → unitPrice captured in modal → Stored in Sanity → BinCountModal reads correct price
```

### Verification:

The BinCountModal code already had proper handling:

```typescript
hasMissingPrice: item.stockItem.unitPrice == null; // Correctly identifies missing prices
```

When items are now created with unitPrice, this will return false and no "No Price" badge will appear.

---

## Bug #2: Items Not Adding Up to Current Stock After Goods Receipt

### Root Cause Analysis (IN PROGRESS)

#### Hypothesis 1: Stock Update Logic ❓

When a goods receipt is completed, the system should:

1. Call `updateStockForTransaction('procurement', receiptId)`
2. Fetch goods receipt with receivedItems
3. For each item: Create update with `isAbsolute=false` (ADJUSTMENT mode)
4. Add quantity to current stock

**Potential Issues:**

- The `updateStockForTransaction` function filters for `receivedQuantity > 0` and `binId` exists
- But the function uses `bulkUpdateStockSnapshots` which processes updates through stock registry
- The registry system might not be correctly ADJUSTING (+=) vs SETTING (=) values

#### Hypothesis 2: Inventory Count Logic ❓

After a goods receipt, if an inventory count is performed:

1. Inventory count uses `isAbsolute=true` (SET absolute value)
2. This overwrites what was added by procurement
3. User expects: Previous stock + Received = System stock
4. Actually sees: Only counted quantity (previous + received overwritten)

#### Investigation Needed:

Looking at `bulkUpdateStockRegistry` in stockCalculations.ts (lines 2400-2500):

```typescript
// Calculate new quantity
let newQuantity: number;
if (isAbsolute || transactionType === "inventoryCount") {
  // SET absolute value  <-- This is the issue!
  newQuantity = quantity;
} else {
  // ADJUST by amount
  newQuantity = currentQty + quantity;
}
```

**The Problem:** When processing inventory counts in `updateStockForTransaction`:

```typescript
case 'inventoryCount':
  // ... fetch count ...
  bulkUpdates = transaction.countedItems
    .map(item => ({
      stockItemId: item.stockItemId,
      binId: transaction.bin,
      quantity: item.countedQuantity || 0,
      transactionType: 'inventoryCount',
      transactionId,
      isAbsolute: true  // <-- SET mode, not ADJUST
    }))
```

This means when saving an inventory count, it **REPLACES** the current stock instead of **ADJUSTING** it.

### Expected vs Actual Flow:

**EXPECTED:**

```
Initial stock: 0
Goods receipt: +50 items → Stock becomes 50
Bin count: Count 48 items (2 damaged) → Stock adjusts to 48
System should show: 48 items
```

**ACTUAL (With Bug):**

```
Initial stock: 0
Goods receipt: +50 items → Stock becomes 50
Bin count: Count 48 items → **Stock REPLACES to 48** (correct by luck)
BUT if we do another receipt of 30 items:
  Stock becomes 78 (50+28 remaining after damage)
Then Bin count: Count 76 items → **Stock REPLACES to 76** (loses the 2 extra from new receipt!)
```

### Fix Required:

The issue is in how inventory counts are being processed. They should:

- Compare counted quantity to system quantity at count time
- Calculate variance
- NOT blindly replace the stock

The current approach assumes the inventory count is the source of truth (which it is for that moment), but subsequent transactions build on it.

---

## Summary of Changes

### Files Modified:

1. ✅ `/src/components/StockItemModal.tsx` - Added unitPrice field and state handling
2. ✅ `/src/app/api/stock-items/route.ts` - Added unitPrice validation and storage
3. 🔄 `/src/lib/stockCalculations.ts` - Needs inventory count logic review
4. 🔄 `/src/app/api/complete-goods-receipt/route.ts` - May need adjustment logic review

### Next Steps:

1. **Test unitPrice fix**: Create a new stock item with price and verify in BinCountModal
2. **Review inventory count logic**: Check if consecutive receipts + counts work correctly
3. **Implement variance calculation**: Should track counted vs system, not replace stock blindly
4. **Add transaction logging**: Better tracking of stock changes for debugging

---

## Technical Details for Developer

### BinCountModal Price Detection

The modal checks for missing prices in two ways:

**When loading existing bin count:**

```typescript
hasMissingPrice: item.stockItem.unitPrice == null;
```

**When displaying:**

```typescript
{item.hasMissingPrice ? (
  <Badge colorScheme="red">No Price</Badge>
)}
```

The price then appears in variance cost calculation:

```typescript
const varianceCost = variance * unitPrice;
```

### Stock Update Flow for Procurement

```
GoodsReceipt Created → Complete Goods Receipt → updateStockForTransaction('procurement', receiptId)
  → Fetch GoodsReceipt with receivedItems[]
  → For each item where receivedQuantity > 0 and binId exists:
     Create { stockItemId, binId, quantity: receivedQuantity, isAbsolute: false }
  → bulkUpdateStockSnapshots() → bulkUpdateStockRegistry()
     → If isAbsolute=false: newQty = currentQty + quantity (CORRECT ✅)
```

### Stock Update Flow for Inventory Count

```
InventoryCount Completed → updateStockForTransaction('inventoryCount', countId)
  → Fetch InventoryCount with countedItems[]
  → For each item:
     Create { stockItemId, binId, quantity: countedQuantity, isAbsolute: true }
  → bulkUpdateStockSnapshots() → bulkUpdateStockRegistry()
     → If isAbsolute=true: newQty = quantity (REPLACES ⚠️)
```

The problem: Inventory counts should adjust future transactions, not replace stock for subsequent receipts.

---

## Recommended Implementation

### For Inventory Count Variance Tracking:

Instead of replacing stock absolutely, store the count as a reference point:

1. When inventory count is completed, save it with systemQuantityAtCountTime
2. Calculate variance = countedQuantity - systemQuantityAtCountTime
3. Future stock calculations use actual transactions, with a checkpoint at the count date
4. This allows proper stock reconstruction post-count

### Code Pattern to Review:

In `stockCalculations.ts`, the `calculateBulkStock` function should be enhanced to:

1. Find all inventory counts in the date range
2. For each item-bin combo, find the LATEST inventory count
3. Use that as the reference point (systemQuantityAtCountTime)
4. Apply only transactions AFTER that count
5. This gives accurate stock without losing transaction history
