import { NextResponse } from 'next/server';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';

const getNextTransferNumber = async (): Promise<string> => {
    try {
        const query = groq`*[_type == "InternalTransfer"] | order(transferNumber desc)[0].transferNumber`;
        const lastTransferNumber = await client.fetch(query);

        if (!lastTransferNumber) {
            return 'TRF-00001'; // First transfer
        }

        // Extract the numeric part from the transfer number (e.g., "TRF-00023" -> 23)
        const match = lastTransferNumber.match(/TRF-(\d+)/);
        if (!match) {
            return 'TRF-00001'; // Fallback if format is unexpected
        }

        const lastNumber = parseInt(match[1], 10);
        const nextNumber = lastNumber + 1;
        return `TRF-${String(nextNumber).padStart(5, '0')}`;
    } catch (error) {
        console.error('Error generating transfer number:', error);
        // Fallback: generate a timestamp-based ID
        return `TRF-${Date.now().toString().slice(-5)}`;
    }
};

export async function GET() {
    try {
        const transferNumber = await getNextTransferNumber();
        return NextResponse.json({ transferNumber });
    } catch (error) {
        console.error('Failed to generate transfer number:', error);
        return NextResponse.json(
            { error: 'Failed to generate transfer number' },
            { status: 500 }
        );
    }
}