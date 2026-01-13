// app/api/complete-goods-receipt/route.ts
import { NextResponse } from 'next/server';
import { client, writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';
import { updateStockForTransaction } from '@/lib/stockCalculations';

export async function POST(request: Request) {
    try {
        const { receiptId, poId, attachmentIds } = await request.json();


        const payload = await request.json();
        console.log('complete-goods-receipt/route.ts - 📥 Receiving goods receipt creation with payload:', {
            status: payload.status,
            receiptNumber: payload.receiptNumber,
            hasStatus: 'status' in payload
        });

        const { _id, ...createData } = payload;
        console.log('📝 Creating with data:', {
            statusInCreateData: createData.status,
            allKeys: Object.keys(createData)
        });

        console.log("id", { receiptId });
        console.log('poid', { poId });
        console.log('atta', attachmentIds);

        if (!receiptId || !poId) {
            return NextResponse.json(
                { error: 'Receipt ID and PO ID are required' },
                { status: 400 }
            );
        }

        // Start a transaction
        const transaction = writeClient.transaction();

        // 1. Update the goods receipt status to 'completed'
        transaction.patch(receiptId, (patch) =>
            patch.set({
                status: 'completed',
                completedAt: new Date().toISOString(),
            })
        );

        // 2. Update the purchase order status to 'complete'
        transaction.patch(poId, (patch) =>
            patch.set({
                status: 'complete',
                evidenceStatus: 'complete',
            })
        );

        // 3. Add attachments to receipt if provided
        if (attachmentIds && attachmentIds.length > 0) {
            // First check if the attachments already exist in the receipt
            const currentReceipt = await writeClient.fetch(
                groq`*[_type == "GoodsReceipt" && _id == $receiptId][0] {
                    attachments[]
                }`,
                { receiptId }
            );

            const existingAttachmentRefs = currentReceipt.attachments?.map((att: any) => att._ref) || [];

            // Add only new attachments that don't already exist
            const newAttachments = attachmentIds
                .filter((attachmentId: string) => !existingAttachmentRefs.includes(attachmentId))
                .map((attachmentId: string) => ({
                    _type: 'reference',
                    _ref: attachmentId,
                    _key: Math.random().toString(36).substr(2, 9)
                }));

            if (newAttachments.length > 0) {
                transaction.patch(receiptId, (patch) =>
                    patch.append('attachments', newAttachments)
                );
            }
        }

        // Execute the transaction
        const result = await transaction.commit();

        // Only update stock if receipt is being completed (not already completed)
        const receiptBeforeUpdate = await client.fetch(
            groq`*[_type == "GoodsReceipt" && _id == $receiptId][0] { status }`,
            { receiptId }
        );

        console.log('🔄 Updating stock snapshots for procurement...');
        await updateStockForTransaction('procurement', receiptId);

        // Update evidence status after transaction
        await updateEvidenceStatus(receiptId, attachmentIds);

        return NextResponse.json({
            success: true,
            message: `Goods receipt completed successfully with ${attachmentIds?.length || 0} attachment(s)`,
            result,
            attachmentCount: attachmentIds?.length || 0
        });
    } catch (error: any) {
        console.error('Failed to complete goods receipt:', error);
        return NextResponse.json(
            {
                error: 'Failed to complete goods receipt',
                details: error.message,
            },
            { status: 500 }
        );
    }
}

// Updated helper function to handle multiple attachments
async function updateEvidenceStatus(receiptId: string, attachmentIds: string[] = []) {
    try {
        const receipt = await writeClient.fetch(
            groq`*[_type == "GoodsReceipt" && _id == $receiptId][0] {
                attachments[]->{_id},
                notes
            }`,
            { receiptId }
        );

        let evidenceStatus = 'pending';

        // Check if we have attachments (either from the receipt or newly provided ones)
        const hasAttachments = (receipt.attachments?.length > 0) || (attachmentIds.length > 0);
        const hasNotes = receipt.notes;

        if (hasAttachments && hasNotes) {
            evidenceStatus = 'complete';
        } else if (hasAttachments) {
            evidenceStatus = 'partial';
        }

        await writeClient
            .patch(receiptId)
            .set({ evidenceStatus })
            .commit();
    } catch (error) {
        console.error('Error updating evidence status:', error);
    }
}