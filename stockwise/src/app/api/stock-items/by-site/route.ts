// src/app/api/stock-items/by-site/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const siteId = searchParams.get('siteId');

        let query;
        let params = {};

        if (siteId) {
            query = groq`*[_type == "StockItem" && site._ref == $siteId] {
                _id,
                name,
                sku,
                unitOfMeasure,
                unitPrice,
                minimumStockLevel,
                reorderQuantity,
                "currentStock": coalesce(currentStock, 0),
                "siteName": site->name,
                "binName": bin->name
            } | order(name asc)`;
            params = { siteId };
        } else {
            query = groq`*[_type == "StockItem"] {
                _id,
                name,
                sku,
                unitOfMeasure,
                unitPrice,
                minimumStockLevel,
                reorderQuantity,
                "currentStock": coalesce(currentStock, 0),
                "siteName": site->name,
                "binName": bin->name
            } | order(siteName asc, name asc)`;
        }

        const stockItems = await writeClient.fetch(query, params);
        return NextResponse.json(stockItems);
    } catch (error) {
        console.error('Error fetching stock items:', error);
        return NextResponse.json(
            { error: 'Failed to fetch stock items' },
            { status: 500 }
        );
    }
}