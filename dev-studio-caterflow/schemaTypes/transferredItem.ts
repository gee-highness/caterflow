// schemas/transferredItem.ts
import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'TransferredItem',
    title: 'Transferred Item',
    type: 'object',
    fields: [
        defineField({
            name: 'key',
            title: 'Key',
            type: 'string',
            readOnly: true,
            hidden: true,
        }),
        defineField({
            name: 'stockItem',
            title: 'Stock Item',
            type: 'reference',
            to: [{ type: 'StockItem' }],
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'transferredQuantity',
            title: 'Transferred Quantity',
            type: 'number',
            validation: (Rule) => Rule.required().min(1).integer(),
        }),
        defineField({
            name: 'notes',
            title: 'Notes',
            type: 'text',
            rows: 2,
        }),
    ],
    preview: {
        select: {
            title: 'stockItem.name',
            subtitle: 'transferredQuantity',
            unit: 'stockItem.unitOfMeasure',
        },
        prepare({ title, subtitle, unit }) {
            return {
                title: title || 'Unknown Item',
                subtitle: `${subtitle || 0} ${unit || ''}`.trim(),
            };
        },
    },
});