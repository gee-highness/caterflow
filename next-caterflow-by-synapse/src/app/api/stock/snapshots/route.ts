// src/app/api/stock/snapshots/route.ts
import { NextResponse } from "next/server";
import { client } from "@/lib/sanity";
import { groq } from "next-sanity";
import { compareSnapshotsWithCalculated } from "@/lib/stockCalculations";

export async function POST(request: Request) {
  try {
    const { stockItemIds, binIds, compare = false } = await request.json();

    if (compare) {
      if (!stockItemIds || !binIds) {
        return NextResponse.json(
          { error: "Both stockItemIds and binIds are required for comparison" },
          { status: 400 },
        );
      }

      const comparison = await compareSnapshotsWithCalculated(
        stockItemIds,
        binIds,
      );
      return NextResponse.json(comparison);
    }

    // Get from registry
    const query = groq`*[_type == "stockRegistry"][0] {
			stockData
		}`;

    const registry = await client.fetch(query);

    // Filter by requested items/bins if provided
    let snapshots: any[] = [];

    if (registry?.stockData?.items) {
      registry.stockData.items.forEach((item: any) => {
        if (
          (!stockItemIds || stockItemIds.includes(item.stockItemId)) &&
          item.binQuantities?.bins
        ) {
          item.binQuantities.bins.forEach((bin: any) => {
            if (!binIds || binIds.includes(bin.binId)) {
              snapshots.push({
                itemId: item.stockItemId,
                binId: bin.binId,
                quantity: bin.quantity || 0,
                lastUpdated: bin.lastUpdated,
                transactionId: bin.lastTransactionId,
                transactionType: bin.lastTransactionType,
              });
            }
          });
        }
      });
    }

    const totalRequested =
      stockItemIds && binIds ? stockItemIds.length * binIds.length : undefined;
    const missingCount =
      typeof totalRequested === "number"
        ? Math.max(0, totalRequested - snapshots.length)
        : undefined;

    return NextResponse.json({
      snapshots,
      total: snapshots.length,
      totalRequested,
      missingCount,
      hasAllSnapshots:
        typeof totalRequested === "number" ? missingCount === 0 : undefined,
      existingSnapshots: snapshots.length,
      registryExists: !!registry,
      registryVersion: registry?.version || 1,
      lastUpdated: registry?.lastUpdated,
    });
  } catch (error: any) {
    console.error("API Error fetching snapshots:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    // Get registry summary
    const query = groq`*[_type == "stockRegistry"][0] {
			_id,
			title,
			lastUpdated,
			version,
			"itemCount": count(stockData.items),
			"totalEntries": count(stockData.items[].binQuantities.bins[])
		}`;

    const registry = await client.fetch(query);

    if (!registry) {
      return NextResponse.json(
        {
          error: "Stock registry not found",
          suggestion: "Run /api/stock/clear-snapshots to create it",
        },
        { status: 404 },
      );
    }

    return NextResponse.json(registry);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
