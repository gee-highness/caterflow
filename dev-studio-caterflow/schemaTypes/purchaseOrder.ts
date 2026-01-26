// schemas/purchaseOrder.ts
import { defineType, defineField } from 'sanity';

// Async helper function to check for unique PO numbers
const isUniquePoNumber = async (poNumber, context) => {
    const { document, getClient } = context;
    if (!poNumber) {
        return true;
    }

    const id = document._id.replace('drafts.', '');
    const client = getClient({ apiVersion: '2025-08-20' });

    const query = `
        !defined(*[_type == "PurchaseOrder" && poNumber == $poNumber && _id != $draft && _id != $published][0]._id)
    `;

    const params = {
        draft: `drafts.${id}`,
        published: id,
        poNumber,
    };

    const result = await client.fetch(query, params);
    return result;
};

export default defineType({
    name: 'PurchaseOrder',
    title: 'Purchase Order',
    type: 'document',
    fields: [
        defineField({
            name: 'poNumber',
            title: 'PO Number',
            type: 'string',
            validation: (Rule) =>
                Rule.required().custom(async (poNumber, context) => {
                    const isUnique = await isUniquePoNumber(poNumber, context);
                    if (!isUnique) {
                        return 'PO Number already exists.';
                    }
                    return true;
                }),
            readOnly: ({ document }) => !!document?.poNumber,
            description: 'Unique Purchase Order identifier.',
            initialValue: async (_, context) => {
                const { getClient } = context;
                const client = getClient({ apiVersion: '2025-08-20' });

                try {
                    const today = new Date().toISOString().slice(0, 10);
                    const query = `
                        *[_type == "purchaseOrder" && _createdAt >= "${today}T00:00:00Z" && _createdAt < "${today}T23:59:59Z"] | order(_createdAt desc)[0] {
                            poNumber
                        }
                    `;
                    const lastPO = await client.fetch(query);

                    let nextNumber = 1;
                    if (lastPO && lastPO.poNumber) {
                        // Extract the number part from formats like "PO-2025-01-20-001"
                        const parts = lastPO.poNumber.split('-');
                        const lastNumberStr = parts[parts.length - 1];
                        const lastNumber = parseInt(lastNumberStr);
                        if (!isNaN(lastNumber)) {
                            nextNumber = lastNumber + 1;
                        }
                    }

                    const paddedNumber = String(nextNumber).padStart(3, '0');
                    return `PO-${today}-${paddedNumber}`;
                } catch (error) {
                    console.error('Error generating PO number:', error);
                    // Fallback to simple timestamp-based number
                    const timestamp = Date.now().toString().slice(-6);
                    return `PO-${timestamp}`;
                }
            },
        }),
        defineField({
            name: 'orderDate',
            title: 'Order Date',
            type: 'datetime',
            initialValue: () => new Date().toISOString(),
            options: {
                dateFormat: 'YYYY-MM-DD',
                calendarTodayLabel: 'Today',
            },
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'status',
            title: 'Status',
            type: 'string',
            options: {
                list: [
                    { title: 'Draft', value: 'draft' },
                    { title: 'Pending Approval', value: 'pending-approval' },
                    { title: 'Approved', value: 'approved' },
                    { title: 'Processed', value: 'processed' },
                    { title: 'Partially Received', value: 'partially-received' },
                    { title: 'Complete', value: 'complete' },
                    { title: 'Cancelled', value: 'cancelled' },
                ],
            },
            initialValue: 'draft',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'orderedItems',
            title: 'Ordered Items',
            type: 'array',
            of: [{ type: 'OrderedItem' }],
            validation: (Rule) => Rule.required().min(1),
        }),
        defineField({
            name: 'expectedDeliveryDate',
            title: 'Expected Delivery Date',
            type: 'date',
            options: {
                dateFormat: 'YYYY-MM-DD',
            },
        }),
        defineField({
            name: 'totalAmount',
            title: 'Total Amount',
            type: 'number',
            readOnly: true,
            description: 'Calculated sum of all ordered items (populated by app).',
        }),
        defineField({
            name: 'orderedBy',
            title: 'Ordered By',
            type: 'reference',
            to: [{ type: 'AppUser' }],
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'approvedBy',
            title: 'Approved By',
            type: 'reference',
            to: [{ type: 'AppUser' }],
            hidden: ({ document }) => document?.status !== 'approved' && document?.status !== 'complete',
        }),
        defineField({
            name: 'approvedAt',
            title: 'Approved At',
            type: 'datetime',
            hidden: ({ document }) => document?.status !== 'approved' && document?.status !== 'complete',
        }),
        defineField({
            name: 'site',
            title: 'Site',
            type: 'reference',
            to: [{ type: 'Site' }],
            description: 'The site this purchase order is for.',
        }),
        defineField({
            name: 'attachments',
            title: 'Attachments',
            type: 'array',
            of: [{ type: 'reference', to: [{ type: 'FileAttachment' }] }],
            description: 'Related documents like invoices, contracts, etc.',
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
            name: 'notes',
            title: 'Notes',
            type: 'text',
            rows: 3,
        }),
    ],
    /**
     * preview: {
    select: {
        title: 'poNumber',
        date: 'orderDate',
        status: 'status',
        by: 'orderedBy',
    },
    prepare({ title, date, status, by }) {

        return {
            title: title || 'New Purchase Order',
            subtitle: "By: " + by + "(" + status + ") - " + date
        };
    },},
     */
    preview: {
        select: {
            title: 'poNumber',
            date: 'orderDate',
            status: 'status',
            itemCount: 'orderedItems.length'
        },
        prepare({ title, date, status, itemCount }) {

            return {
                title: title || 'New Purchase Order',
                subtitle: `${date ? new Date(date).toLocaleDateString() : 'No date'} | Status: ${status || 'draft'}`,
            };
        },
    },

    orderings: [
        {
            name: 'newest',
            title: 'Newest First',
            by: [{ field: 'orderDate', direction: 'desc' }],
        },
        {
            name: 'oldest',
            title: 'Oldest First',
            by: [{ field: 'orderDate', direction: 'asc' }],
        },
        {
            name: 'poNumberAsc',
            title: 'PO Number (Ascending)',
            by: [{ field: 'poNumber', direction: 'asc' }],
        },
        {
            name: 'status',
            title: 'Status',
            by: [{ field: 'status', direction: 'asc' }],
        },
        {
            name: 'totalAmountDesc',
            title: 'Total Amount (High to Low)',
            by: [{ field: 'totalAmount', direction: 'desc' }],
        },
    ],
});