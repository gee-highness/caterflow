// src/app/api/activity/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';
import { getUserSiteInfo, buildTransactionSiteFilter } from '@/lib/siteFiltering';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe') || 'week';

    // Get user site info for filtering
    const userSiteInfo = await getUserSiteInfo(request);
    const siteFilter = buildTransactionSiteFilter(userSiteInfo);

    // Calculate date range based on timeframe
    const now = new Date();
    let startDate = new Date();

    switch (timeframe) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Enhanced query with more detailed information and site filtering
    const query = groq`
      {
        "receipts": *[_type == "GoodsReceipt" && _createdAt >= $startDate ${siteFilter}] | order(_createdAt desc) {
          _id,
          _type,
          receiptNumber,
          "description": "Received " + count(receivedItems) + " items at " + receivingBin->name + " (" + receiptNumber + ")",
          "user": receivedBy->name,
          "timestamp": _createdAt,
          "siteName": receivingBin->site->name,
          "itemCount": count(receivedItems),
          "binName": receivingBin->name
        },
        "dispatches": *[_type == "DispatchLog" && _createdAt >= $startDate ${siteFilter}] | order(_createdAt desc) {
          _id,
          _type,
          dispatchNumber,
          dispatchType->{name},
          "description": dispatchType->name + " dispatch: " + count(dispatchedItems) + " items from " + sourceBin->name + " (" + dispatchNumber + ")",
          "user": dispatchedBy->name,
          "timestamp": _createdAt,
          "siteName": sourceBin->site->name,
          "itemCount": count(dispatchedItems),
          "binName": sourceBin->name,
          "dispatchType": dispatchType->name
        },
        "transfers": *[_type == "InternalTransfer" && _createdAt >= $startDate ${siteFilter}] | order(_createdAt desc) {
          _id,
          _type,
          transferNumber,
          "description": "Transfer " + count(transferredItems) + " items from " + fromBin->name + " to " + toBin->name + " (" + transferNumber + ")",
          "user": transferredBy->name,
          "timestamp": _createdAt,
          "siteName": fromBin->site->name + " → " + toBin->site->name,
          "itemCount": count(transferredItems),
          "fromBin": fromBin->name,
          "toBin": toBin->name
        },
        "adjustments": *[_type == "StockAdjustment" && _createdAt >= $startDate ${siteFilter}] | order(_createdAt desc) {
          _id,
          _type,
          adjustmentNumber,
          "description": "Stock adjustment: " + count(adjustedItems) + " items at " + bin->name + " (" + adjustmentNumber + ")",
          "user": adjustedBy->name,
          "timestamp": _createdAt,
          "siteName": bin->site->name,
          "itemCount": count(adjustedItems),
          "binName": bin->name
        },
        "inventoryCounts": *[_type == "InventoryCount" && _createdAt >= $startDate ${siteFilter}] | order(_createdAt desc) {
          _id,
          _type,
          countNumber,
          "description": "Inventory count: " + count(countedItems) + " items in " + bin->name + " (" + countNumber + ")",
          "user": countedBy->name,
          "timestamp": _createdAt,
          "siteName": bin->site->name,
          "itemCount": count(countedItems),
          "binName": bin->name
        }
      }
    `;

    const data = await client.fetch(query, { startDate: startDate.toISOString() });

    // Combine all activity types
    const allActivities = [
      ...data.receipts,
      ...data.dispatches,
      ...data.transfers,
      ...data.adjustments,
      ...data.inventoryCounts
    ];

    // Sort by timestamp (newest first)
    allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json(allActivities);
  } catch (error) {
    console.error('Failed to fetch activity:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity' },
      { status: 500 }
    );
  }
}