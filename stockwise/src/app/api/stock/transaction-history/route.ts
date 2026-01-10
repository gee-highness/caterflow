import { NextRequest, NextResponse } from 'next/server';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';

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

		console.log(`🔍 Fetching FULL transaction history for ${stockItemId} in ${binId}`);

		// FIRST: Find the latest inventory count that includes this item
		const latestCountQuery = groq`*[
      _type == "InventoryCount" && 
      bin._ref == $binId &&
      status == "completed"
    ] | order(countDate desc) {
      _id,
      countDate,
      countedItems[] {
        "itemId": stockItem._ref,
        countedQuantity
      }
    }`;

		const latestCounts = await client.fetch(latestCountQuery, { binId });

		// Find the latest count date for this specific item
		let latestCountDate = null;
		let countQuantity = 0;

		for (const count of latestCounts) {
			const itemInCount = count.countedItems?.find((item: any) => item.itemId === stockItemId);
			if (itemInCount) {
				latestCountDate = count.countDate;
				countQuantity = itemInCount.countedQuantity;
				break;
			}
		}

		console.log(`📅 Latest count for ${stockItemId} in ${binId}: ${latestCountDate || 'Never counted'}`);

		// NOW: Get ALL transactions after the latest count (or all if no count)
		const dateFilter = latestCountDate ? `&& date > $latestCountDate` : '';
		const params: any = { binId, stockItemId };
		if (latestCountDate) {
			params.latestCountDate = latestCountDate;
		}

		const query = groq`{
      // Get goods receipts (incoming stock)
      "goodsReceipts": *[
        _type == "GoodsReceipt" && 
        receivingBin._ref == $binId &&
        status in ["completed", "processed"]
        ${dateFilter}
      ] | order(receiptDate desc) {
        _id,
        receiptDate,
        receiptNumber,
        status,
        receivedItems[] {
          "itemId": stockItem._ref,
          receivedQuantity,
          unitPrice
        }
      },
      
      // Get dispatches (outgoing stock)
      "dispatches": *[
        _type == "DispatchLog" && 
        sourceBin._ref == $binId &&
        status in ["completed", "processed"]
        ${dateFilter}
      ] | order(dispatchDate desc) {
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
      
      // Get transfers OUT from this bin
      "transfersOut": *[
        _type == "InternalTransfer" && 
        status == "completed" && 
        fromBin._ref == $binId
        ${dateFilter}
      ] | order(transferDate desc) {
        _id,
        transferDate,
        transferNumber,
        status,
        transferredItems[] {
          "itemId": stockItem._ref,
          transferredQuantity
        }
      },
      
      // Get transfers IN to this bin
      "transfersIn": *[
        _type == "InternalTransfer" && 
        status == "completed" && 
        toBin._ref == $binId
        ${dateFilter}
      ] | order(transferDate desc) {
        _id,
        transferDate,
        transferNumber,
        status,
        transferredItems[] {
          "itemId": stockItem._ref,
          transferredQuantity
        }
      },
      
      // Get ALL inventory counts (for timeline)
      "inventoryCounts": *[
        _type == "InventoryCount" && 
        bin._ref == $binId &&
        status == "completed"
      ] | order(countDate desc) {
        _id,
        countDate,
        countNumber,
        status,
        countedItems[] {
          "itemId": stockItem._ref,
          countedQuantity
        }
      },
      
      // Get item details for display
      "itemDetails": *[_type == "StockItem" && _id == $stockItemId][0] {
        _id,
        name,
        sku,
        unitOfMeasure,
        minimumStockLevel,
        reorderQuantity
      },
      
      // Get bin details
      "binDetails": *[_type == "Bin" && _id == $binId][0] {
        _id,
        name,
        site->{
          _id,
          name
        }
      }
    }`;

		const data = await client.fetch(query, params);

		// Process and format the data
		const transactions: Array<{
			id: string;
			date: string;
			type: 'receipt' | 'dispatch' | 'transferOut' | 'transferIn' | 'count';
			documentNumber: string;
			quantity: number;
			runningTotal: number;
			description: string;
			status: string;
			unitPrice?: number;
		}> = [];

		// Start with the latest inventory count as our baseline
		if (latestCountDate && countQuantity > 0) {
			const count = latestCounts.find((c: any) =>
				c.countedItems?.some((item: any) => item.itemId === stockItemId)
			);

			if (count) {
				transactions.push({
					id: count._id,
					date: count.countDate,
					type: 'count',
					documentNumber: `COUNT-${new Date(count.countDate).getFullYear()}-XXXX`,
					quantity: countQuantity,
					runningTotal: countQuantity,
					description: `Inventory Count - Set baseline stock to ${countQuantity}`,
					status: 'completed'
				});
			}
		}

		// Process goods receipts (sorted ascending for calculation)
		const sortedReceipts = [...(data.goodsReceipts || [])].sort((a, b) =>
			new Date(a.receiptDate).getTime() - new Date(b.receiptDate).getTime()
		);

		sortedReceipts.forEach((receipt: any) => {
			const item = receipt.receivedItems?.find((i: any) => i.itemId === stockItemId);
			if (item) {
				const currentTotal = transactions.length > 0 ?
					transactions[transactions.length - 1].runningTotal : countQuantity;
				const newTotal = currentTotal + (item.receivedQuantity || 0);

				transactions.push({
					id: receipt._id,
					date: receipt.receiptDate,
					type: 'receipt',
					documentNumber: receipt.receiptNumber || `GR-${new Date(receipt.receiptDate).getFullYear()}-XXXX`,
					quantity: item.receivedQuantity || 0,
					runningTotal: newTotal,
					description: `Goods Receipt - Received ${item.receivedQuantity} units`,
					status: receipt.status,
					unitPrice: item.unitPrice
				});
			}
		});

		// Process dispatches
		const sortedDispatches = [...(data.dispatches || [])].sort((a, b) =>
			new Date(a.dispatchDate).getTime() - new Date(b.dispatchDate).getTime()
		);

		sortedDispatches.forEach((dispatch: any) => {
			const item = dispatch.dispatchedItems?.find((i: any) => i.itemId === stockItemId);
			if (item) {
				const currentTotal = transactions.length > 0 ?
					transactions[transactions.length - 1].runningTotal : countQuantity;
				const newTotal = Math.max(0, currentTotal - (item.dispatchedQuantity || 0));

				transactions.push({
					id: dispatch._id,
					date: dispatch.dispatchDate,
					type: 'dispatch',
					documentNumber: dispatch.dispatchNumber || `DISP-${new Date(dispatch.dispatchDate).getFullYear()}-XXXX`,
					quantity: -(item.dispatchedQuantity || 0),
					runningTotal: newTotal,
					description: `Dispatch - Sent ${item.dispatchedQuantity} units`,
					status: dispatch.evidenceStatus || dispatch.status
				});
			}
		});

		// Process transfers out
		const sortedTransfersOut = [...(data.transfersOut || [])].sort((a, b) =>
			new Date(a.transferDate).getTime() - new Date(b.transferDate).getTime()
		);

		sortedTransfersOut.forEach((transfer: any) => {
			const item = transfer.transferredItems?.find((i: any) => i.itemId === stockItemId);
			if (item) {
				const currentTotal = transactions.length > 0 ?
					transactions[transactions.length - 1].runningTotal : countQuantity;
				const newTotal = Math.max(0, currentTotal - (item.transferredQuantity || 0));

				transactions.push({
					id: transfer._id,
					date: transfer.transferDate,
					type: 'transferOut',
					documentNumber: transfer.transferNumber || `TRANSFER-OUT-${new Date(transfer.transferDate).getFullYear()}-XXXX`,
					quantity: -(item.transferredQuantity || 0),
					runningTotal: newTotal,
					description: `Transfer Out - Sent ${item.transferredQuantity} units to another bin`,
					status: transfer.status
				});
			}
		});

		// Process transfers in
		const sortedTransfersIn = [...(data.transfersIn || [])].sort((a, b) =>
			new Date(a.transferDate).getTime() - new Date(b.transferDate).getTime()
		);

		sortedTransfersIn.forEach((transfer: any) => {
			const item = transfer.transferredItems?.find((i: any) => i.itemId === stockItemId);
			if (item) {
				const currentTotal = transactions.length > 0 ?
					transactions[transactions.length - 1].runningTotal : countQuantity;
				const newTotal = currentTotal + (item.transferredQuantity || 0);

				transactions.push({
					id: transfer._id,
					date: transfer.transferDate,
					type: 'transferIn',
					documentNumber: transfer.transferNumber || `TRANSFER-IN-${new Date(transfer.transferDate).getFullYear()}-XXXX`,
					quantity: item.transferredQuantity || 0,
					runningTotal: newTotal,
					description: `Transfer In - Received ${item.transferredQuantity} units from another bin`,
					status: transfer.status
				});
			}
		});

		// Sort all transactions by date (most recent first for display)
		transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

		return NextResponse.json({
			success: true,
			item: data.itemDetails,
			bin: data.binDetails,
			latestCount: latestCountDate ? {
				date: latestCountDate,
				quantity: countQuantity
			} : null,
			transactions: transactions,
			summary: {
				totalTransactions: transactions.length,
				currentStock: transactions.length > 0 ? transactions[0].runningTotal : 0,
				calculatedFrom: latestCountDate ? `Inventory Count on ${new Date(latestCountDate).toLocaleDateString()}` : 'Beginning of records',
				goodsReceipts: sortedReceipts.filter((r: any) =>
					r.receivedItems?.some((i: any) => i.itemId === stockItemId)
				).length,
				dispatches: sortedDispatches.filter((d: any) =>
					d.dispatchedItems?.some((i: any) => i.itemId === stockItemId)
				).length,
				transfers: (sortedTransfersOut.length + sortedTransfersIn.length)
			}
		});

	} catch (error: any) {
		console.error('Error in transaction history API:', error);
		return NextResponse.json(
			{
				error: error.message || 'Failed to fetch transaction history',
				success: false
			},
			{ status: 500 }
		);
	}
}