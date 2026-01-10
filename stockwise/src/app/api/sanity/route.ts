// src/app/api/sanity/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { client } from '@/lib/sanity';

export async function POST(request: NextRequest) {
    try {
        const { query, params = {} } = await request.json();

        if (!query) {
            return NextResponse.json(
                { error: 'Query is required' },
                { status: 400 }
            );
        }

        const result = await client.fetch(query, params);

        return NextResponse.json(result);
    } catch (error) {
        console.error('Sanity API error:', error);
        return NextResponse.json(
            { error: 'Failed to execute query' },
            { status: 500 }
        );
    }
}