// src/app/api/sites/[siteId]/main-bin/route.ts
import { NextResponse } from 'next/server';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ siteId: string }> }
) {
    try {
        const { siteId } = await params; // Await the params promise

        if (!siteId) {
            return NextResponse.json(
                { error: 'Site ID is required' },
                { status: 400 }
            );
        }

        const decodedSiteId = decodeURIComponent(siteId);
        const query = groq`*[_type == "Bin" && site._ref == $siteId && binType == "main-storage"][0] {
        _id,
        name,
        "site": site->{_id, name}
    }`;

        const mainBin = await client.fetch(query, { siteId: decodedSiteId });

        if (!mainBin) {
            return NextResponse.json(
                { error: 'Main bin not found for this site' },
                { status: 404 }
            );
        }

        return NextResponse.json(mainBin);
    } catch (error) {
        console.error('Error fetching main bin:', error);
        return NextResponse.json(
            { error: 'Failed to fetch main bin' },
            { status: 500 }
        );
    }
}
