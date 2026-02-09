// schemas/stockRegistry.ts
import { defineType, defineField } from 'sanity';

export default defineType({
	name: 'StockRegistry',
	title: 'Stock Registry',
	type: 'document',
	fields: [
		defineField({
			name: 'title',
			title: 'Title',
			type: 'string',
			initialValue: 'Stock Registry v1',
			readOnly: true,
		}),
		defineField({
			name: 'stockData',
			title: 'Stock Data',
			type: 'object',
			fields: [
				defineField({
					name: 'items',
					title: 'Items',
					type: 'array',
					of: [{
						type: 'object',
						name: 'stockItemEntry',
						fields: [
							defineField({
								name: 'stockItemId',
								title: 'Stock Item ID',
								type: 'string',
							}),
							defineField({
								name: 'binQuantities',
								title: 'Bin Quantities',
								type: 'object',
								fields: [
									defineField({
										name: 'bins',
										title: 'Bins',
										type: 'array',
										of: [{
											type: 'object',
											name: 'binStock',
											fields: [
												defineField({
													name: 'binId',
													title: 'Bin ID',
													type: 'string',
												}),
												defineField({
													name: 'quantity',
													title: 'Quantity',
													type: 'number',
													validation: Rule => Rule.min(0),
												}),
												defineField({
													name: 'lastUpdated',
													title: 'Last Updated',
													type: 'datetime',
												}),
												defineField({
													name: 'lastTransactionId',
													title: 'Last Transaction ID',
													type: 'string',
												}),
												defineField({
													name: 'lastTransactionType',
													title: 'Last Transaction Type',
													type: 'string',
													options: {
														list: ['goodsReceipt', 'dispatch', 'transfer', 'inventoryCount']
													},
												}),
											],
										}],
									}),
								],
							}),
						],
					}],
				}),
			],
		}),
		defineField({
			name: 'lastUpdated',
			title: 'Last Updated',
			type: 'datetime',
		}),
		defineField({
			name: 'version',
			title: 'Version',
			type: 'number',
			initialValue: 1,
		}),
	],
	preview: {
		select: {
			title: 'title',
			lastUpdated: 'lastUpdated',
			version: 'version',
		},
		prepare({ title, lastUpdated, version }) {
			return {
				title: title,
				subtitle: `Version ${version} | Last updated: ${lastUpdated ? new Date(lastUpdated).toLocaleDateString() : 'Never'}`,
			};
		},
	},
});