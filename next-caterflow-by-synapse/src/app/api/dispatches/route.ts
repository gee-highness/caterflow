// src/app/api/dispatches/route.ts
import { NextResponse } from 'next/server';
import { client, writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';
import { logSanityInteraction } from '@/lib/sanityLogger';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { getUserSiteInfo, buildTransactionSiteFilter } from '@/lib/siteFiltering';
import { updateStockForTransaction } from '@/lib/stockCalculations';

// normalize refs to string ids
const resolveRef = (val: any): string | null => {
    if (!val && val !== 0) return null;
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
        if (typeof val._ref === 'string') return val._ref;
        if (typeof val._id === 'string') return val._id;
    }
    return null;
};

const getNextDispatchNumber = async (): Promise<string> => {
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
        const newDispatchNumber = `DL-${String(nextNumber).padStart(5, '0')}`;

        // Double-check this number doesn't already exist (concurrency safety)
        const checkQuery = groq`count(*[_type == "DispatchLog" && dispatchNumber == $newNumber])`;
        const existingCount = await client.fetch(checkQuery, { newNumber: newDispatchNumber });

        if (existingCount > 0) {
            // If it exists, try the next number
            return `DL-${String(nextNumber + 1).padStart(5, '0')}`;
        }

        return newDispatchNumber;
    } catch (error) {
        console.error('Error generating dispatch number:', error);
        // Fallback with timestamp to ensure uniqueness
        const timestamp = new Date().getTime();
        return `DL-${String(timestamp).slice(-5)}`;
    }
};

// --- GET all dispatches ---
export async function GET() {
    try {
        const userSiteInfo = await getUserSiteInfo();
        const siteFilter = buildTransactionSiteFilter(userSiteInfo);

        const query = groq`*[_type == "DispatchLog" ${siteFilter}] | order(dispatchDate desc) {
            _id,
            dispatchNumber,
            dispatchDate,
            evidenceStatus,
            peopleFed,
            notes,
            totalCost,
            costPerPerson,
            sellingPrice, // ADDED
            totalSales, // ADDED
            "dispatchType": dispatchType->{
                _id,
                name,
                description,
                defaultTime,
                sellingPrice // ADDED
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

        const dispatches = await client.fetch(query);

        // Filter out incomplete dispatches (missing required refs)
        const validDispatches = dispatches.filter((dispatch: any) =>
            dispatch.sourceBin !== null &&
            dispatch.dispatchType !== null
        );

        return NextResponse.json(validDispatches);
    } catch (error) {
        console.error('Failed to fetch dispatches:', error);
        return NextResponse.json({ error: 'Failed to fetch dispatches' }, { status: 500 });
    }
}

// --- POST create dispatch ---
export async function POST(request: Request) {
    console.log('🚀 POST /api/dispatches - Starting dispatch creation');

    try {
        const session = await getServerSession(authOptions);
        console.log('🔐 Session check:', session ? `User ${session.user.email} authenticated` : 'No session');

        if (!session || !session.user) {
            console.log('❌ User not authenticated');
            return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
        }

        const body = await request.json();
        console.log('📦 Request body received:', {
            hasDispatchType: !!body.dispatchType,
            hasSourceBin: !!body.sourceBin,
            hasDispatchDate: !!body.dispatchDate,
            dispatchedItemsCount: body.dispatchedItems?.length || 0,
            peopleFed: body.peopleFed
        });

        const { _id, ...createData } = body;

        if (!createData.dispatchType || !createData.sourceBin || !createData.dispatchDate) {
            console.log('❌ Missing required fields:', {
                dispatchType: !!createData.dispatchType,
                sourceBin: !!createData.sourceBin,
                dispatchDate: !!createData.dispatchDate
            });
            return NextResponse.json({ error: 'Missing required fields (dispatchType, sourceBin, dispatchDate)' }, { status: 400 });
        }

        console.log('✅ Required fields present');

        // normalize references
        const dispatchTypeRef = resolveRef(createData.dispatchType);
        const sourceBinRef = resolveRef(createData.sourceBin);
        const dispatchedByRef = resolveRef(createData.dispatchedBy) || session.user.id;

        console.log('🔗 Normalized references:', {
            dispatchTypeRef,
            sourceBinRef,
            dispatchedByRef,
            userId: session.user.id
        });

        // Process dispatched items with unit prices and total cost
        console.log('📋 Processing dispatched items...');
        const dispatchedItems = (createData.dispatchedItems || []).map((item: any, index: number) => {
            // Explicitly convert to Number for safe calculation
            const unitPrice = Number(item.unitPrice) || 0;
            const dispatchedQuantity = Number(item.dispatchedQuantity) || 0;
            const totalCost = unitPrice * dispatchedQuantity;

            console.log(`   Item ${index + 1}:`, {
                stockItem: resolveRef(item.stockItem),
                quantity: dispatchedQuantity,
                unitPrice,
                totalCost
            });

            return {
                _type: 'DispatchedItem',
                _key: item._key || uuidv4(),
                stockItem: {
                    _type: 'reference',
                    _ref: resolveRef(item.stockItem) || resolveRef(item.stockItem?._id) || null,
                },
                dispatchedQuantity: dispatchedQuantity,
                unitPrice: unitPrice,
                totalCost: totalCost,
                notes: item.notes || '',
            };
        });

        // Calculate grand total cost and cost per person
        const totalCost = dispatchedItems.reduce((sum: number, item: any) => sum + (item.totalCost || 0), 0);
        // Explicitly convert peopleFed to Number for safe calculation
        const peopleFed = Number(createData.peopleFed) || 0;
        const costPerPerson = peopleFed > 0 ? totalCost / peopleFed : 0;

        console.log('💰 Cost calculations:', {
            totalCost,
            peopleFed,
            costPerPerson,
            itemsCount: dispatchedItems.length
        });

        // Generate dispatch number
        console.log('🔢 Generating dispatch number...');
        const dispatchNumber = await getNextDispatchNumber();
        console.log('✅ Dispatch number generated:', dispatchNumber);

        const newDoc: any = {
            ...createData,
            _type: 'DispatchLog',
            dispatchNumber,
            _id: uuidv4(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            evidenceStatus: 'pending',
            peopleFed: peopleFed,
            totalCost: totalCost,
            costPerPerson: costPerPerson,
            dispatchType: dispatchTypeRef ? { _type: 'reference', _ref: dispatchTypeRef } : undefined,
            sourceBin: sourceBinRef ? { _type: 'reference', _ref: sourceBinRef } : undefined,
            dispatchedBy: dispatchedByRef ? { _type: 'reference', _ref: dispatchedByRef } : undefined,
            dispatchedItems,
        };

        console.log('📄 Document to create:', {
            _id: newDoc._id,
            dispatchNumber: newDoc.dispatchNumber,
            evidenceStatus: newDoc.evidenceStatus,
            hasDispatchType: !!newDoc.dispatchType,
            hasSourceBin: !!newDoc.sourceBin,
            hasDispatchedBy: !!newDoc.dispatchedBy
        });

        console.log('💾 Creating document in Sanity...');
        const result = await writeClient.create(newDoc);
        console.log('✅ Document created successfully:', {
            _id: result._id,
            dispatchNumber: result.dispatchNumber
        });

        // Update stock calculations
        await updateStockForTransaction('dispatch', result._id);

        console.log('📝 Logging interaction...');
        await logSanityInteraction(
            'create',
            `Created new dispatch: ${newDoc.dispatchNumber} with total cost: E {(totalCost}`,
            'DispatchLog',
            result._id,
            session.user.id,
            true
        );
        console.log('✅ Interaction logged');

        console.log('🎉 Dispatch creation completed successfully');
        return NextResponse.json(result);

    } catch (error) {
        console.error('❌ Failed to create dispatch:', error);

        // Log additional error details
        if (error instanceof Error) {
            console.error('📛 Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
        }

        // Check if it's a Sanity-specific error
        if (error && typeof error === 'object') {
            const sanityError = error as any;
            console.error('🏥 Sanity API error:', {
                statusCode: sanityError.statusCode,
                message: sanityError.message,
                details: sanityError.details
            });
        }
        return NextResponse.json({ error: 'Failed to create dispatch' }, { status: 500 });
    }
}

// --- PATCH update by body (legacy / optional) ---
export async function PATCH(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
        }

        const body = await request.json();
        const { _id, ...updateData } = body;

        if (!_id) {
            return NextResponse.json({ error: 'Dispatch ID is required' }, { status: 400 });
        }

        // REMOVED: Site permission check for PATCH

        // Fetch existing doc to check evidenceStatus
        const existingDispatch = await client.fetch(
            groq`*[_type == "DispatchLog" && _id == $id][0] { 
                evidenceStatus 
            }`,
            { id: _id }
        );

        if (!existingDispatch) {
            return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 });
        }

        // Check evidenceStatus for editability
        if (existingDispatch?.evidenceStatus === 'complete') {
            return NextResponse.json({ error: 'Dispatch is completed and cannot be edited' }, { status: 400 });
        }

        let patch = writeClient.patch(_id).set({ updatedAt: new Date().toISOString() });

        if (updateData.dispatchDate) patch = patch.set({ dispatchDate: updateData.dispatchDate });
        if (updateData.evidenceStatus) patch = patch.set({ evidenceStatus: updateData.evidenceStatus });
        if (updateData.hasOwnProperty('peopleFed')) patch = patch.set({ peopleFed: updateData.peopleFed });
        if (updateData.notes) patch = patch.set({ notes: updateData.notes });

        if (updateData.dispatchType) {
            const ref = resolveRef(updateData.dispatchType);
            if (ref) patch = patch.set({ dispatchType: { _type: 'reference', _ref: ref } });
        }

        if (updateData.sourceBin) {
            const ref = resolveRef(updateData.sourceBin);
            if (ref) patch = patch.set({ sourceBin: { _type: 'reference', _ref: ref } });
        }

        if (updateData.dispatchedBy) {
            const ref = resolveRef(updateData.dispatchedBy);
            if (ref) patch = patch.set({ dispatchedBy: { _type: 'reference', _ref: ref } });
        } else {
            patch = patch.set({ dispatchedBy: { _type: 'reference', _ref: session.user.id } });
        }

        if (updateData.dispatchedItems) {
            const normalizedItems = (updateData.dispatchedItems || []).map((item: any) => {
                const stockRef = resolveRef(item.stockItem) || resolveRef(item.stockItem?._id) || resolveRef(item.stockItem?._ref);
                const unitPrice = item.unitPrice || 0;
                const dispatchedQuantity = item.dispatchedQuantity || 0;
                const totalCost = unitPrice * dispatchedQuantity;

                return {
                    _type: 'DispatchedItem',
                    _key: item._key || uuidv4(),
                    stockItem: {
                        _type: 'reference',
                        _ref: stockRef,
                    },
                    dispatchedQuantity: dispatchedQuantity,
                    unitPrice: unitPrice,
                    totalCost: totalCost,
                    notes: item.notes || '',
                };
            });
            patch = patch.set({ dispatchedItems: normalizedItems });

            // Recalculate total cost and cost per person
            const totalCost = normalizedItems.reduce((sum: number, item: any) => sum + (item.totalCost || 0), 0);
            const peopleFed = updateData.peopleFed || 0;
            const costPerPerson = peopleFed > 0 ? totalCost / peopleFed : 0;

            patch = patch.set({ totalCost: totalCost });
            patch = patch.set({ costPerPerson: costPerPerson });
        }

        // If caller provided attachments array, set it (replace); caller should pass properly shaped refs.
        if (updateData.attachments) {
            patch = patch.set({ attachments: updateData.attachments });
        }

        // Allow setting status fields (e.g., status:'completed') — caller is responsible for using this safely.
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

        const result = await patch.commit();

        // Update stock calculations after patch
        await updateStockForTransaction('dispatch', result._id);

        await logSanityInteraction(
            'update',
            `Updated dispatch: ${updateData.dispatchNumber || _id}`,
            'DispatchLog',
            _id,
            session.user.id,
            true
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error('Failed to update dispatch:', error);
        return NextResponse.json({ error: 'Failed to update dispatch' }, { status: 500 });
    }
}

// --- DELETE by query param ?id=... ---
export async function DELETE(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Dispatch ID is required' }, { status: 400 });
        }

        // REMOVED: Site permission check for DELETE

        // Fetch existing doc to check evidenceStatus
        const existingDispatch = await client.fetch(
            groq`*[_type == "DispatchLog" && _id == $id][0] { 
                evidenceStatus 
            }`,
            { id }
        );

        if (!existingDispatch) {
            return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 });
        }

        // prevent deletion of completed dispatches
        if (existingDispatch?.evidenceStatus === 'complete') {
            return NextResponse.json({ error: 'Completed dispatch cannot be deleted' }, { status: 400 });
        }

        await writeClient.delete(id);

        await logSanityInteraction(
            'delete',
            `Deleted dispatch: ${id}`,
            'DispatchLog',
            id,
            session.user.id,
            true
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete dispatch:', error);
        return NextResponse.json({ error: 'Failed to delete dispatch' }, { status: 500 });
    }
}