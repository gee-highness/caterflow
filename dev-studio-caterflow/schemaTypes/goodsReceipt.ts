// schemas/goodsReceipt.ts
import { defineType, defineField } from 'sanity';
import client from '../lib/client';

const isUniqueReceiptNumber = async (receiptNumber, context) => {
    const { document, getClient } = context;
    if (!receiptNumber) {
        return true;
    }

    const id = document._id.replace('drafts.', '');
    const client = getClient({ apiVersion: '2025-08-20' });

    const query = `
        !defined(*[_type == "GoodsReceipt" && receiptNumber == $receiptNumber && _id != $draft && _id != $published][0]._id)
    `;

    const params = {
        draft: `drafts.${id}`,
        published: id,
        receiptNumber,
    };

    const result = await client.fetch(query, params);
    return result;
};

export default defineType({
    name: 'GoodsReceipt',
    title: 'Goods Receipt',
    type: 'document',
    fields: [
        defineField({
            name: 'receiptNumber',
            title: 'Receipt Number',
            type: 'string',
            validation: (Rule) =>
                Rule.required().custom(async (receiptNumber, context) => {
                    const isUnique = await isUniqueReceiptNumber(receiptNumber, context);
                    if (!isUnique) {
                        return 'Receipt Number already exists.';
                    }
                    return true;
                }),
            readOnly: ({ document }) => !!document.receiptNumber,
            description: 'Unique Goods Receipt identifier.',
            initialValue: async () => {
                const today = new Date().toISOString().slice(0, 10);
                const query = `
                    *[_type == "GoodsReceipt" && _createdAt >= "${today}T00:00:00Z" && _createdAt < "${today}T23:59:59Z"] | order(_createdAt desc)[0] {
                        receiptNumber
                    }
                `;
                const lastReceipt = await client.fetch(query);

                let nextNumber = 1;
                if (lastReceipt && lastReceipt.receiptNumber) {
                    const lastNumber = parseInt(lastReceipt.receiptNumber.split('-').pop());
                    if (!isNaN(lastNumber)) {
                        nextNumber = lastNumber + 1;
                    }
                }

                const paddedNumber = String(nextNumber).padStart(3, '0');
                return `GR-${today}-${paddedNumber}`;
            },
        }),
        defineField({
            name: 'status',
            title: 'Status',
            type: 'string',
            options: {
                list: [
                    { title: 'Draft', value: 'draft' },
                    { title: 'Partially Received', value: 'partially-received' },
                    { title: 'Completed', value: 'completed' },
                    { title: 'Cancelled', value: 'cancelled' },
                ],
            },
            initialValue: 'draft',
            validation: (Rule) => Rule.required(),
            description: 'Overall status of the goods receipt',
        }),
        defineField({
            name: 'receiptDate',
            title: 'Receipt Date',
            type: 'datetime',
            initialValue: new Date().toISOString(),
            options: {
                dateFormat: 'YYYY-MM-DD',
                calendarTodayLabel: 'Today',
            },
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'purchaseOrder',
            title: 'Associated Purchase Order',
            type: 'reference',
            to: [{ type: 'PurchaseOrder' }],
            description: 'Optional: Link to the original Purchase Order if applicable.',
        }),
        defineField({
            name: 'receivedBy',
            title: 'Received By',
            type: 'reference',
            to: [{ type: 'AppUser' }],
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'receivingBin',
            title: 'Receiving Bin',
            type: 'reference',
            to: [{ type: 'Bin' }],
            validation: (Rule) => Rule.required(),
            description: 'The bin where the goods were initially stored.',
        }),
        defineField({
            name: 'receivedItems',
            title: 'Received Items',
            type: 'array',
            of: [{ type: 'ReceivedItem' }],
            validation: (Rule) => Rule.required().min(1),
        }),
        defineField({
            name: 'attachments',
            title: 'Attachments',
            type: 'array',
            of: [{ type: 'reference', to: [{ type: 'FileAttachment' }] }],
            description: 'Related documents like delivery notes, quality checks, etc.',
        }),
        defineField({
            name: 'evidenceStatus',
            title: 'Evidence Status',
            type: 'string',
            options: {
                list: [
                    { title: 'Pending', value: 'pending' },
                    { title: 'Partial', value: 'partial' },
                    { title: 'Complete', value: 'complete' },
                ],
            },
            initialValue: 'pending',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'completedAt',
            title: 'Completed At',
            type: 'datetime',
            description: 'Date when the receipt was marked as completed',
        }),
        defineField({
            name: 'notes',
            title: 'Notes',
            type: 'text',
            rows: 3,
        }),
    ],
    preview: {
        select: {
            title: 'receiptNumber',
            date: 'receiptDate',
            po: 'purchaseOrder.poNumber',
            bin: 'receivingBin.name',
            status: 'status',
            evidenceStatus: 'evidenceStatus',
        },
        prepare({ title, date, po, bin, status, evidenceStatus }) {
            const poText = po ? ` | PO: ${po}` : '';
            const statusText = status ? ` | Status: ${status}` : '';
            const evidenceText = evidenceStatus ? ` | Evidence: ${evidenceStatus}` : '';
            return {
                title: `Receipt: ${title}`,
                subtitle: `${date ? new Date(date).toLocaleDateString() : 'No date'} | To: ${bin || 'No bin'}${poText}${statusText}${evidenceText}`,
            };
        },
    },
    orderings: [
        {
            name: 'newest',
            title: 'Newest First',
            by: [{ field: 'receiptDate', direction: 'desc' }],
        },
        {
            name: 'oldest',
            title: 'Oldest First',
            by: [{ field: 'receiptDate', direction: 'asc' }],
        },
        {
            name: 'receiptNumberAsc',
            title: 'Receipt Number (Ascending)',
            by: [{ field: 'receiptNumber', direction: 'asc' }],
        },
        {
            name: 'status',
            title: 'Status',
            by: [{ field: 'status', direction: 'asc' }],
        },
    ],
});