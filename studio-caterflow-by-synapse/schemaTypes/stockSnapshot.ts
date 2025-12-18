// schemas/stockItem.ts
import { defineType, defineField, ValidationContext } from 'sanity';
import client from '../lib/client';


export default defineType({
    name: 'stockSnapshot',
    title: 'Stock Snapshot',
    type: 'document',
    fields: [
        {
            name: 'stockItem',
            title: 'Stock Item',
            type: 'reference',
            to: [{ type: 'StockItem' }],
            validation: Rule => Rule.required()
        },
        {
            name: 'bin',
            title: 'Bin',
            type: 'reference',
            to: [{ type: 'Bin' }],
            validation: Rule => Rule.required()
        },
        {
            name: 'quantity',
            title: 'Quantity',
            type: 'number',
            validation: Rule => Rule.required().min(0)
        },
        {
            name: 'lastUpdated',
            title: 'Last Updated',
            type: 'datetime',
            validation: Rule => Rule.required()
        },
        {
            name: 'lastTransaction',
            title: 'Last Transaction',
            type: 'reference',
            to: [
                { type: 'GoodsReceipt' },
                { type: 'DispatchLog' },
                { type: 'InternalTransfer' },
                { type: 'InventoryCount' }
            ]
        },
        {
            name: 'lastTransactionType',
            title: 'Last Transaction Type',
            type: 'string',
            options: {
                list: ['goodsReceipt', 'dispatch', 'transfer', 'inventoryCount']
            }
        }
    ],
    preview: {
        select: {
            title: 'stockItem.name',
            subtitle: 'bin.name',
            quantity: 'quantity'
        },
        prepare(selection) {
            const { title, subtitle, quantity } = selection;
            return {
                title: `${title}`,
                subtitle: `${subtitle} - ${quantity} units`
            };
        }
    }
});