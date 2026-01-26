// schemas/fileAttachment.ts
import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'FileAttachment',
    title: 'File Attachment',
    type: 'document',
    fields: [
        defineField({
            name: 'fileName',
            title: 'File Name',
            type: 'string',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'fileType',
            title: 'File Type',
            type: 'string',
            options: {
                list: [
                    { title: 'Invoice', value: 'invoice' },
                    { title: 'Receipt', value: 'receipt' },
                    { title: 'Photo', value: 'photo' },
                    { title: 'Contract', value: 'contract' },
                    { title: 'Delivery Note', value: 'delivery-note' },
                    { title: 'Quality Check', value: 'quality-check' },
                    { title: 'Other', value: 'other' },
                ],
            },
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'file',
            title: 'File',
            type: 'file',
            validation: (Rule) => Rule.required(),
            options: {
                accept: '.pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx',
            },
        }),
        defineField({
            name: 'uploadedBy',
            title: 'Uploaded By',
            type: 'reference',
            to: [{ type: 'AppUser' }],
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'uploadedAt',
            title: 'Uploaded At',
            type: 'datetime',
            initialValue: new Date().toISOString(),
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'description',
            title: 'Description',
            type: 'text',
            rows: 3,
        }),
        defineField({
            name: 'relatedTo',
            title: 'Related To',
            type: 'reference',
            to: [
                { type: 'PurchaseOrder' },
                { type: 'GoodsReceipt' },
                { type: 'DispatchLog' },
                { type: 'StockAdjustment' },
                { type: 'InternalTransfer' },
                { type: 'InventoryCount' },
            ],
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'isArchived',
            title: 'Archived',
            type: 'boolean',
            initialValue: false,
            description: 'Mark as archived to hide from active views',
        }),
    ],
    preview: {
        select: {
            title: 'fileName',
            subtitle: 'fileType',
            media: 'file',
        },
        prepare(selection) {
            const { title, subtitle, media } = selection;
            return {
                title: title,
                subtitle: `Type: ${subtitle}`,
                media: media,
            };
        },
    },
    orderings: [
        {
            title: 'Uploaded Date, New',
            name: 'uploadedAtDesc',
            by: [{ field: 'uploadedAt', direction: 'desc' }],
        },
        {
            title: 'Uploaded Date, Old',
            name: 'uploadedAtAsc',
            by: [{ field: 'uploadedAt', direction: 'asc' }],
        },
        {
            title: 'File Name',
            name: 'fileNameAsc',
            by: [{ field: 'fileName', direction: 'asc' }],
        },
    ],
});