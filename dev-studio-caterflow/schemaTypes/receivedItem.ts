// schemas/receivedItem.js
import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'ReceivedItem', // Capitalized for consistency
    title: 'Received Item',
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
            name: 'receivedQuantity',
            title: 'Received Quantity',
            type: 'number',
            validation: (Rule) => Rule.required().min(0).integer(),
        }),
        defineField({
            name: 'batchNumber',
            title: 'Batch Number',
            type: 'string',
            description: 'Optional: For tracking specific production batches.',
        }),
        defineField({
            name: 'expiryDate',
            title: 'Expiry Date',
            type: 'date',
            options: {
                dateFormat: 'YYYY-MM-DD',
            },
            description: 'Crucial for perishable items.',
        }),
        defineField({
            name: 'condition',
            title: 'Condition',
            type: 'string',
            options: {
                list: [
                    { title: 'Good', value: 'good' },
                    { title: 'Damaged', value: 'damaged' },
                    { title: 'Short Shipped', value: 'short-shipped' },
                    { title: 'Over Shipped', value: 'over-shipped' },
                ],
            },
            validation: (Rule) => Rule.required(),
        }),
    ],
    preview: {
        select: {
            title: 'stockItem.name',
            subtitle: 'receivedQuantity',
            unit: 'stockItem.unitOfMeasure',
            condition: 'condition',
        },
        prepare({ title, subtitle, unit, condition }) {
            return {
                title: title,
                subtitle: `${subtitle} ${unit} (${condition})`,
            };
        },
    },
});