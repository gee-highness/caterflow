// schemas/adjustedItem.js
import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'AdjustedItem', // Capitalized for consistency
    title: 'Adjusted Item',
    type: 'object',
    fields: [
        defineField({
            name: 'stockItem',
            title: 'Stock Item',
            type: 'reference',
            to: [{ type: 'StockItem' }], // Consistent capitalization
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'adjustedQuantity',
            title: 'Adjusted Quantity',
            type: 'number',
            validation: (Rule) => Rule.required().integer(),
            description: 'Can be negative for reduction (e.g., -5) or positive for addition (e.g., 5).',
        }),
        defineField({
            name: 'reason',
            title: 'Reason for Adjustment',
            type: 'text',
            rows: 2,
            validation: (Rule) => Rule.required(),
        }),
    ],
    preview: {
        select: {
            title: 'stockItem.name',
            subtitle: 'adjustedQuantity',
            unit: 'stockItem.unitOfMeasure',
            reason: 'reason',
        },
        prepare({ title, subtitle, unit, reason }) {
            const sign = subtitle > 0 ? '+' : '';
            return {
                title: title,
                subtitle: `${sign}${subtitle} ${unit} (${reason})`,
            };
        },
    },
});