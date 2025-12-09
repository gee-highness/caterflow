// src/app/api/dispatches/[dispatchId]/route.ts
import { NextResponse } from 'next/server';
import { client, writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';
import { logSanityInteraction } from '@/lib/sanityLogger';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { revertPreviousStockChanges, updateStockForTransaction } from '@/lib/stockCalculations';

// Helper to normalize incoming reference values to a plain string id
const resolveRef = (val: any): string | null => {
    if (!val && val !== 0) return null;
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
        if (typeof val._ref === 'string') return val._ref;
        if (typeof val._id === 'string') return val._id;
    }
    return null;
};

// --- GET single dispatch ---
export async function GET(request: Request, { params }: { params: Promise<{ dispatchId: string }> }) {
    try {
        const { dispatchId } = await params;

        if (!dispatchId) {
            return NextResponse.json({ error: 'Dispatch ID is required' }, { status: 400 });
        }

        const query = groq`*[_type == "DispatchLog" && _id == $dispatchId][0] {
            _id,
            dispatchNumber,
            dispatchDate,
            evidenceStatus,
            peopleFed,
            notes,
            status,
            totalCost,
            costPerPerson,
            "dispatchType": dispatchType->{
                _id,
                name,
                description,
                defaultTime
            },
            "sourceBin": sourceBin->{
                _id,
                name,
                "site": site->{
                    _id,
                    name,
                    location,
                    code
                }
            },
            "dispatchedBy": dispatchedBy->{
                _id,
                name,
                email,
                role,
                "assignedSite": associatedSite->{
                    _id,
                    name
                }
            },
            "dispatchedItems": coalesce(dispatchedItems[]{
                _key,
                dispatchedQuantity,
                unitPrice,
                totalCost,
                notes,
                "stockItem": stockItem->{
                    _id,
                    name,
                    sku,
                    unitOfMeasure,
                    currentStock,
                    "category": category->{
                        _id,
                        title
                    }
                }
            }, []),
            "attachments": coalesce(attachments[]->{
                _id,
                fileName,
                fileType,
                description,
                uploadedAt,
                "file": file{
                    "asset": asset->{
                        _id,
                        _type,
                        url,
                        originalFilename,
                        mimeType
                    }
                }
            }, [])
        }`;

        const dispatch = await client.fetch(query, { dispatchId });

        if (!dispatch) {
            return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 });
        }

        return NextResponse.json(dispatch);
    } catch (error) {
        console.error('Failed to fetch dispatch:', error);
        return NextResponse.json({ error: 'Failed to fetch dispatch' }, { status: 500 });
    }
}

// --- PATCH single dispatch ---
export async function PATCH(request: Request, { params }: { params: Promise<{ dispatchId: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
        }

        const { dispatchId } = await params;
        const updateData = await request.json();

        if (!dispatchId) {
            return NextResponse.json({ error: 'Dispatch ID is required' }, { status: 400 });
        }

        // fetch existing dispatch to get current state (evidenceStatus, dispatchedItems, peopleFed)
        // This ensures we have the correct items and people fed count for recalculation
        const existing = await client.fetch(
            `*[_type=="DispatchLog" && _id == $id][0]{ evidenceStatus, dispatchedItems, peopleFed }`,
            { id: dispatchId }
        );

        if (existing?.evidenceStatus === 'complete') {
            return NextResponse.json({ error: 'Dispatch is completed and cannot be edited' }, { status: 400 });
        }

        let patch = writeClient.patch(dispatchId).set({ updatedAt: new Date().toISOString() });
        // Initialize the items list with existing data as a default
        let normalizedItems = existing?.dispatchedItems || [];
        let peopleFed = existing?.peopleFed || 0;


        // simple fields
        if (updateData.dispatchDate) patch = patch.set({ dispatchDate: updateData.dispatchDate });
        if (updateData.evidenceStatus) patch = patch.set({ evidenceStatus: updateData.evidenceStatus });
        // NOTE: Capture peopleFed update for later recalculation
        if (updateData.hasOwnProperty('peopleFed')) {
            patch = patch.set({ peopleFed: updateData.peopleFed });
            peopleFed = Number(updateData.peopleFed) || 0; // Update local variable
        }
        if (updateData.notes) patch = patch.set({ notes: updateData.notes });

        // references - robustly resolve to string ids
        if (updateData.dispatchType) {
            const ref = resolveRef(updateData.dispatchType);
            if (ref) {
                patch = patch.set({ dispatchType: { _type: 'reference', _ref: ref } });
            }
        }

        if (updateData.sourceBin) {
            const ref = resolveRef(updateData.sourceBin);
            if (ref) {
                patch = patch.set({ sourceBin: { _type: 'reference', _ref: ref } });
            }
        }

        if (updateData.dispatchedBy) {
            const ref = resolveRef(updateData.dispatchedBy);
            if (ref) {
                patch = patch.set({ dispatchedBy: { _type: 'reference', _ref: ref } });
            }
        } else if (session?.user?.id) {
            patch = patch.set({ dispatchedBy: { _type: 'reference', _ref: session.user.id } });
        }

        // dispatchedItems - ensure _ref is a string and include unitPrice, totalCost
        if (updateData.dispatchedItems) {
            normalizedItems = (updateData.dispatchedItems || []).map((item: any) => {
                const stockRef = resolveRef(item.stockItem) || resolveRef(item.stockItem?._ref) || resolveRef(item.stockItem?._id);

                // ✅ FIX: Properly extract unitPrice from the item object
                const unitPrice = Number(item.unitPrice) || 0;
                const dispatchedQuantity = Number(item.dispatchedQuantity) || 0;
                const totalCost = unitPrice * dispatchedQuantity;

                return {
                    _type: 'DispatchedItem',
                    _key: item._key || uuidv4(),
                    stockItem: {
                        _type: 'reference',
                        _ref: stockRef,
                    },
                    dispatchedQuantity: dispatchedQuantity,
                    unitPrice: unitPrice, // ✅ This should now work
                    totalCost: totalCost, // ✅ This should now work
                    notes: item.notes || '',
                };
            });
            patch = patch.set({ dispatchedItems: normalizedItems });
        }

        // Recalculate total cost and cost per person using the normalized items
        // This is now outside the `if (updateData.dispatchedItems)` block, 
        // ensuring it runs if other data (like peopleFed) is updated.
        const totalCost = normalizedItems.reduce((sum: number, item: any) => sum + (Number(item.totalCost) || 0), 0);
        const costPerPerson = peopleFed > 0 ? totalCost / peopleFed : 0;

        // Set the final calculated grand totals on the main document
        patch = patch.set({ totalCost: totalCost });
        patch = patch.set({ costPerPerson: costPerPerson });


        if (updateData.attachments) {
            patch = patch.set({ attachments: updateData.attachments });
        }

        if (updateData.status) {
            patch = patch.set({ status: updateData.status });
        }
        if (updateData.completedAt) {
            patch = patch.set({ completedAt: updateData.completedAt });
        }
        if (updateData.completedBy) {
            const cbRef = resolveRef(updateData.completedBy) || updateData.completedBy;
            if (cbRef) patch = patch.set({ completedBy: { _type: 'reference', _ref: cbRef } });
        }


        const wasCompleted = existing?.evidenceStatus === 'complete';
        const willBeCompleted = updateData.evidenceStatus === 'complete' || (!updateData.evidenceStatus && wasCompleted);

        if (wasCompleted && (updateData.dispatchedItems || updateData.sourceBin)) {
            console.log('↩️ Reverting previous stock changes for dispatch edit');
            await revertPreviousStockChanges(dispatchId);
        }

        const result = await patch.commit();

        // Update stock snapshots if dispatch is completed
        if (result.evidenceStatus === 'complete' || willBeCompleted) {
            await updateStockForTransaction('dispatch', dispatchId);
        }

        await logSanityInteraction(
            'update',
            `Updated dispatch: ${updateData.dispatchNumber || dispatchId}`,
            'DispatchLog',
            dispatchId,
            session.user.id,
            true
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error('Failed to update dispatch:', error);
        return NextResponse.json({ error: 'Failed to update dispatch' }, { status: 500 });
    }
}

// --- DELETE single dispatch ---
export async function DELETE(request: Request, { params }: { params: Promise<{ dispatchId: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
        }

        const { dispatchId } = await params;

        if (!dispatchId) {
            return NextResponse.json({ error: 'Dispatch ID is required' }, { status: 400 });
        }

        // prevent deletion if already completed
        const existing = await client.fetch(`*[_type=="DispatchLog" && _id == $id][0]{ evidenceStatus }`, { id: dispatchId });
        if (existing?.evidenceStatus === 'complete') {
            return NextResponse.json({ error: 'Completed dispatch cannot be deleted' }, { status: 400 });
        }

        await writeClient.delete(dispatchId);

        await logSanityInteraction(
            'delete',
            `Deleted dispatch: ${dispatchId}`,
            'DispatchLog',
            dispatchId,
            session.user.id,
            true
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete dispatch:', error);
        return NextResponse.json({ error: 'Failed to delete dispatch' }, { status: 500 });
    }
}