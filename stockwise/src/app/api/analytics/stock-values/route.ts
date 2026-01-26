import { NextResponse } from 'next/server';
import { calculateBulkStock } from '@/lib/stockCalculations';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function GET() {
    try {
        // Get all stock items and bins
        const [stockItems, bins] = await Promise.all([
            client.fetch(groq`*[_type == "StockItem"] {
                _id, name, sku, unitPrice, minimumStockLevel, unitOfMeasure,
                "category": category->title
            }`),
            client.fetch(groq`*[_type == "Bin"] { _id }`)
        ]);

        const stockItemIds = stockItems.map((item: any) => item._id);
        const binIds = bins.map((bin: any) => bin._id);

        // Calculate actual stock using the same function as CurrentStockPage
        const stockResults = await calculateBulkStock(stockItemIds, binIds);

        // Calculate total inventory value and stock status
        const itemsWithStock = stockItems.map((item: any) => {
            let totalStock = 0;
            binIds.forEach((binId: any) => {
                const key = `${item._id}-${binId}`;
                totalStock += stockResults[key] || 0;
            });

            const stockStatus = totalStock === 0 ? 'out-of-stock' :
                totalStock <= item.minimumStockLevel ? 'low-stock' : 'in-stock';

            return {
                ...item,
                currentStock: totalStock,
                stockValue: totalStock * (item.unitPrice || 0),
                stockStatus
            };
        });

        const totalInventoryValue = itemsWithStock.reduce((sum: any, item: { stockValue: any; }) => sum + item.stockValue, 0);
        const lowStockItems = itemsWithStock.filter((item: { stockStatus: string; }) => item.stockStatus === 'low-stock');
        const outOfStockItems = itemsWithStock.filter((item: { stockStatus: string; }) => item.stockStatus === 'out-of-stock');

        return NextResponse.json({
            items: itemsWithStock,
            summary: {
                totalInventoryValue,
                totalItems: itemsWithStock.length,
                lowStockCount: lowStockItems.length,
                outOfStockCount: outOfStockItems.length,
                inStockCount: itemsWithStock.length - lowStockItems.length - outOfStockItems.length
            }
        });

    } catch (error) {
        console.error('Error calculating stock values:', error);
        return NextResponse.json({ error: 'Failed to calculate stock values' }, { status: 500 });
    }
}