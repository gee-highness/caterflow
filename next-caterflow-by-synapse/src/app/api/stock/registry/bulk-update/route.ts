import { NextRequest, NextResponse } from 'next/server';
import { client, writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const updates = body.updates;

		if (!updates || !Array.isArray(updates)) {
			return NextResponse.json(
				{ error: 'Invalid updates array' },
				{ status: 400 }
			);
		}

		console.log(`📝 API: Processing ${updates.length} registry updates`);

		// Remove duplicates (same item-bin combination)
		const uniqueUpdates = Array.from(
			new Map(
				updates.map(update => [`${update.stockItemId}-${update.binId}`, update])
			).values()
		);

		console.log(`📊 Unique items to update: ${uniqueUpdates.length} (from ${updates.length} total)`);

		// Get the current registry document
		const registryQuery = groq`*[_type == "stockRegistry"][0] {
      _id,
      stockData,
      version
    }`;

		const existingRegistry = await client.fetch(registryQuery);
		const now = new Date().toISOString();

		// Prepare registry data
		let registryData = existingRegistry?.stockData || { items: [] };

		// Create lookup maps for faster updates
		const itemMap = new Map<string, { item: any; index: number }>();
		registryData.items?.forEach((item: any, index: number) => {
			if (item.stockItemId) {
				itemMap.set(item.stockItemId, { item, index });
			}
		});

		const results = { success: 0, failed: 0 };

		// Apply all updates
		for (const update of uniqueUpdates) {
			try {
				const { stockItemId, binId, quantity, transactionType, transactionId, isAbsolute } = update;

				// Find or create item entry
				let itemEntry = itemMap.get(stockItemId);
				if (!itemEntry) {
					// Create new item
					const newItem = {
						stockItemId,
						binQuantities: { bins: [] },
					};
					registryData.items.push(newItem);
					const itemIndex = registryData.items.length - 1;
					itemMap.set(stockItemId, { item: newItem, index: itemIndex });
					itemEntry = { item: newItem, index: itemIndex };
				}

				// Find or create bin entry
				const item = itemEntry.item;
				let binEntry = item.binQuantities?.bins?.find((b: any) => b.binId === binId);

				// Calculate new quantity
				let currentQty = binEntry?.quantity || 0;
				let newQuantity: number;

				if (isAbsolute || transactionType === 'inventoryCount') {
					// SET absolute value
					newQuantity = quantity;
				} else {
					// ADJUST by amount
					newQuantity = currentQty + quantity;

					// Safety check for dispatches
					if (transactionType === 'dispatch' && newQuantity < 0) {
						console.warn(`⚠️ Dispatch would make stock negative: ${stockItemId} in ${binId}`);
						newQuantity = 0;
					}
				}

				// Update or create bin entry
				const updatedBinEntry = {
					binId,
					quantity: newQuantity,
					lastUpdated: now,
					lastTransactionId: transactionId,
					lastTransactionType: transactionType,
				};

				if (binEntry) {
					// Update existing bin
					const binIndex = item.binQuantities.bins.findIndex((b: any) => b.binId === binId);
					if (binIndex !== -1) {
						item.binQuantities.bins[binIndex] = updatedBinEntry;
					}
				} else {
					// Create new bin
					if (!item.binQuantities) {
						item.binQuantities = { bins: [] };
					}
					if (!item.binQuantities.bins) {
						item.binQuantities.bins = [];
					}
					item.binQuantities.bins.push(updatedBinEntry);
				}

				results.success++;

			} catch (error) {
				console.error(`❌ Failed to process update for ${update.stockItemId}-${update.binId}:`, error);
				results.failed++;
			}
		}

		// Save to database
		const updateData = {
			stockData: registryData,
			lastUpdated: now,
			version: (existingRegistry?.version || 0) + 1,
		};

		if (existingRegistry) {
			await writeClient
				.patch(existingRegistry._id)
				.set(updateData)
				.commit();
		} else {
			await writeClient.create({
				_type: 'stockRegistry',
				title: 'Stock Registry v1',
				...updateData,
			});
		}

		console.log(`✅ API: Registry bulk update complete: ${results.success} succeeded, ${results.failed} failed`);

		return NextResponse.json({
			success: true,
			results,
			timestamp: now
		});

	} catch (error: any) {
		console.error('❌ API Error updating stock registry:', error);
		return NextResponse.json(
			{
				success: false,
				error: error.message || 'Failed to update stock registry'
			},
			{ status: 500 }
		);
	}
}