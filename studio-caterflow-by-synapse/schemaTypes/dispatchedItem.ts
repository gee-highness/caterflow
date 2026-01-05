// schemas/dispatchedItem.ts (REPLACE ENTIRE FILE - same as Step 3 in previous response)
import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'DispatchedItem',
    title: 'Dispatched Item',
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
            name: 'sourceBin',
            title: 'Source Bin',
            type: 'reference',
            to: [{ type: 'Bin' }],
            validation: (Rule) => Rule.required(),
            description: 'The bin from which this item was dispatched',
        }),
        defineField({
            name: 'dispatchedQuantity',
            title: 'Dispatched Quantity',
            type: 'number',
            validation: (Rule) => Rule.required().min(0),
        }),
        defineField({
            name: 'unitPrice',
            title: 'Unit Price at Dispatch',
            type: 'number',
            validation: (Rule) => Rule.required().min(0),
            description: 'Unit price at the time of dispatch (stored for historical accuracy)',
        }),
        defineField({
            name: 'totalCost',
            title: 'Total Cost',
            type: 'number',
            description: 'Calculated as unitPrice × dispatchedQuantity',
            readOnly: true,
        }),
        defineField({
            name: 'notes',
            title: 'Item Notes',
            type: 'text',
            rows: 2,
            description: 'Specific notes about this item in the dispatch',
        }),
    ],
    preview: {
        select: {
            title: 'stockItem.name',
            subtitle: 'dispatchedQuantity',
            unit: 'stockItem.unitOfMeasure',
            unitPrice: 'unitPrice',
            totalCost: 'totalCost',
        },
        prepare({ title, subtitle, unit, unitPrice, totalCost }) {
            return {
                title: title,
                subtitle: `${subtitle} ${unit} | Unit: E ${unitPrice || 0} | Total: E ${totalCost || 0}`,
            };
        },
    },
});