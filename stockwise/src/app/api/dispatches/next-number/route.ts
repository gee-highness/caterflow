import { NextResponse } from 'next/server';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function GET() {
    try {
        // Get all dispatch numbers and find the maximum
        const query = groq`*[_type == "DispatchLog" && defined(dispatchNumber)].dispatchNumber`;
        const allDispatchNumbers = await client.fetch(query);

        let maxNumber = 0;

        if (allDispatchNumbers && allDispatchNumbers.length > 0) {
            allDispatchNumbers.forEach((dispatchNumber: string) => {
                if (dispatchNumber && dispatchNumber.startsWith('DL-')) {
                    const numberPart = dispatchNumber.split('-')[1];
                    const currentNumber = parseInt(numberPart);
                    if (!isNaN(currentNumber) && currentNumber > maxNumber) {
                        maxNumber = currentNumber;
                    }
                }
            });
        }

        // Generate the next number
        const nextNumber = maxNumber + 1;
        const dispatchNumber = `DL-${String(nextNumber).padStart(5, '0')}`;

        return NextResponse.json({ dispatchNumber });
    } catch (error) {
        console.error('Error generating dispatch number:', error);
        return NextResponse.json(
            { error: 'Failed to generate dispatch number' },
            { status: 500 }
        );
    }
}