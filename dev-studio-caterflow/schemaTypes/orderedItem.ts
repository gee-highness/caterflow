// schemas/orderedItem.ts
import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'OrderedItem',
    title: 'Ordered Item',
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
            name: 'supplier',
            title: 'Supplier',
            type: 'reference',
            to: [{ type: 'Supplier' }],
        }),
        defineField({
            name: 'orderedQuantity',
            title: 'Ordered Quantity',
            type: 'number',
            validation: (Rule) => Rule.required().min(1).integer(),
        }),
        defineField({
            name: 'unitPrice',
            title: 'Unit Price',
            type: 'number',
            validation: (Rule) => Rule.required().min(0),
            description: 'Price per unit at the time of order.',
        }),
        defineField({
            name: 'priceManuallyUpdated',
            title: 'Price manually updated',
            type: 'boolean',
            initialValue: false,
            description:
                'Flag set when a price was manually updated from the procurement UI.',
        }),
        defineField({
            name: 'totalPrice',
            title: 'Total Price',
            type: 'number',
            readOnly: true,
            description: 'Computed: orderedQuantity * unitPrice',
            options: {
                // Optionally you could use a custom input component to show this
            },
        }),
    ],
    preview: {
        select: {
            title: 'stockItem.name',
            subtitle: 'orderedQuantity',
            unit: 'stockItem.unitOfMeasure',
            supplier: 'supplier.name',
            unitPrice: 'unitPrice',
            orderedQuantity: 'orderedQuantity',
        },
        prepare({ title, subtitle, unit, supplier, unitPrice, orderedQuantity }) {
            const stockTitle = title || 'Unnamed item';
            const qty = subtitle ?? '';
            const unitText = unit ? ` ${unit}` : '';
            const supplierText = supplier ? ` from ${supplier}` : '';
            const total = unitPrice && orderedQuantity ? unitPrice * orderedQuantity : 0;
            return {
                title: stockTitle,
                subtitle: `${qty}${unitText}${supplierText} = ${total.toFixed(2)}`,
            };
        },
    },
});
