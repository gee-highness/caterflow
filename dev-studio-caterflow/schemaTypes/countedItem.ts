// schemas/countedItem.js
import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'CountedItem',
    title: 'Counted Item',
    type: 'object',
    fields: [
        defineField({
            name: 'stockItem',
            title: 'Stock Item',
            type: 'reference',
            to: [{ type: 'StockItem' }],
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'countedQuantity',
            title: 'Counted Quantity',
            type: 'number',
            validation: (Rule) => Rule.required().min(0),
        }),
        defineField({
            name: 'systemQuantityAtCountTime',
            title: 'System Quantity (at count time)',
            type: 'number',
            readOnly: true,
            description: 'The quantity recorded in the system when the count was initiated. (Populated by app)',
        }),
        defineField({
            name: 'variance',
            title: 'Variance',
            type: 'number',
            readOnly: true,
            description: 'Difference between Counted Quantity and System Quantity.',
        }),
        defineField({
            name: 'varianceCost',
            title: 'Variance Cost',
            type: 'number',
            readOnly: true,
            description: 'Monetary value of the variance (variance × unit price).',
        }),
        defineField({
            name: 'unitPrice',
            title: 'Unit Price',
            type: 'number',
            readOnly: true,
            description: 'Unit price of the item at count time.',
        }),
    ],
    preview: {
        select: {
            title: 'stockItem.name',
            subtitle: 'countedQuantity',
            unit: 'stockItem.unitOfMeasure',
            systemQty: 'systemQuantityAtCountTime',
            countedQty: 'countedQuantity',
            varianceCost: 'varianceCost',
        },
        prepare({ title, subtitle, unit, systemQty, countedQty, varianceCost }) {
            const variance = (countedQty !== undefined && systemQty !== undefined) ? countedQty - systemQty : 'N/A';
            const varianceText = variance !== 'N/A' ? ` (Variance: ${variance})` : '';
            const costText = varianceCost !== undefined ? ` | Cost: $${varianceCost.toFixed(2)}` : '';
            return {
                title: title,
                subtitle: `${subtitle} ${unit}${varianceText}${costText}`,
            };
        },
    },
});