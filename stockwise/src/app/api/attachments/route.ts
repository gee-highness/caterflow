// src/app/api/attachments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const relatedTo = searchParams.get('relatedTo');

        if (!relatedTo) {
            return NextResponse.json(
                { error: 'relatedTo parameter is required' },
                { status: 400 }
            );
        }

        const query = groq`
            *[_type == "FileAttachment" && relatedTo._ref == $relatedTo && !isArchived] | order(uploadedAt desc) {
                _id,
                fileName,
                fileType,
                file {
                    asset -> {
                        url,
                        originalFilename,
                        size,
                        mimeType
                    }
                },
                uploadedBy -> {
                    _id,
                    name
                },
                uploadedAt,
                description
            }
        `;

        const attachments = await client.fetch(query, { relatedTo });

        return NextResponse.json(attachments);
    } catch (error) {
        console.error('Failed to fetch attachments:', error);
        return NextResponse.json(
            { error: 'Failed to fetch attachments' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const relatedTo = searchParams.get('relatedTo');

        if (!id) {
            return NextResponse.json(
                { error: 'Attachment ID is required' },
                { status: 400 }
            );
        }

        // Archive the attachment instead of deleting it
        await client
            .patch(id)
            .set({ isArchived: true })
            .commit();

        // Remove the attachment reference from the related document
        if (relatedTo) {
            await client
                .patch(relatedTo)
                .unset([`attachments[_ref=="${id}"]`])
                .commit();
        }

        return NextResponse.json({ success: true, message: 'Attachment archived successfully' });
    } catch (error) {
        console.error('Failed to archive attachment:', error);
        return NextResponse.json(
            { error: 'Failed to archive attachment' },
            { status: 500 }
        );
    }
}