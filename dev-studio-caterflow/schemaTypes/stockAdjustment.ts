// schemas/stockAdjustment.ts
import { defineType, defineField } from 'sanity';
import client from '../lib/client';

const isUniqueAdjustmentNumber = async (adjustmentNumber: string | undefined, context: any) => {
    const { document, getClient } = context;
    if (!adjustmentNumber) {
        return true;
    }

    const id = document?._id.replace('drafts.', '');
    const client = getClient({ apiVersion: '2025-08-20' });

    const query = `
        !defined(*[_type == "StockAdjustment" && adjustmentNumber == $adjustmentNumber && _id != $draft && _id != $published][0]._id)
    `;

    const params = {
        draft: `drafts.${id}`,
        published: id,
        adjustmentNumber,
    };

    const result = await client.fetch(query, params);
    return result;
};

export default defineType({
    name: 'StockAdjustment',
    title: 'Stock Adjustment',
    type: 'document',
    fields: [
        defineField({
            name: 'adjustmentNumber',
            title: 'Adjustment Number',
            type: 'string',
            validation: (Rule) =>
                Rule.required().custom(async (adjustmentNumber, context) => {
                    const isUnique = await isUniqueAdjustmentNumber(adjustmentNumber, context);
                    if (!isUnique) {
                        return 'Adjustment Number already exists.';
                    }
                    return true;
                }),
            readOnly: ({ document }) => !!document?.adjustmentNumber,
            description: 'Unique Stock Adjustment identifier.',
            initialValue: async () => {
                const today = new Date().toISOString().slice(0, 10);
                const query = `
                    *[_type == "StockAdjustment" && _createdAt >= "${today}T00:00:00Z" && _createdAt < "${today}T23:59:59Z"] | order(_createdAt desc)[0] {
                        adjustmentNumber
                    }
                `;
                const lastAdjustment = await client.fetch(query);

                let nextNumber = 1;
                if (lastAdjustment && lastAdjustment.adjustmentNumber) {
                    const lastNumber = parseInt(lastAdjustment.adjustmentNumber.split('-').pop());
                    if (!isNaN(lastNumber)) {
                        nextNumber = lastNumber + 1;
                    }
                }

                const paddedNumber = String(nextNumber).padStart(3, '0');
                return `SA-${today}-${paddedNumber}`;
            },
        }),
        defineField({
            name: 'adjustmentDate',
            title: 'Adjustment Date',
            type: 'datetime',
            initialValue: new Date().toISOString(),
            options: {
                dateFormat: 'YYYY-MM-DD',
                timeFormat: 'HH:mm',
                calendarTodayLabel: 'Today',
            },
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'bin',
            title: 'Bin',
            type: 'reference',
            to: [{ type: 'Bin' }],
            validation: (Rule) => Rule.required(),
            description: 'The storage bin where the adjustment occurred.',
        }),
        defineField({
            name: 'adjustedBy',
            title: 'Adjusted By',
            type: 'reference',
            to: [{ type: 'AppUser' }],
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'adjustmentType',
            title: 'Adjustment Type',
            type: 'string',
            options: {
                list: [
                    { title: 'Correction', value: 'correction' },
                    { title: 'Loss', value: 'loss' },
                    { title: 'Wastage', value: 'wastage' },
                    { title: 'Expiry', value: 'expiry' },
                    { title: 'Damage', value: 'damage' },
                    { title: 'Theft', value: 'theft' },
                    { title: 'Found', value: 'found' },
                    { title: 'Donation', value: 'donation' },
                    { title: 'Sample', value: 'sample' },
                ],
            },
            validation: (Rule) => Rule.required(),
            description: 'Reason for the stock adjustment.',
        }),
        defineField({
            name: 'adjustedItems',
            title: 'Adjusted Items',
            type: 'array',
            of: [{ type: 'AdjustedItem' }],
            validation: (Rule) => Rule.required().min(1),
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
                    { title: 'Completed', value: 'completed' },
                    { title: 'Cancelled', value: 'cancelled' },
                ],
            },
            initialValue: 'draft',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'approvedBy',
            title: 'Approved By',
            type: 'reference',
            to: [{ type: 'AppUser' }],
            readOnly: true,
            hidden: ({ document }) => document?.status !== 'approved' && document?.status !== 'completed',
        }),
        defineField({
            name: 'approvedAt',
            title: 'Approved At',
            type: 'datetime',
            readOnly: true,
            hidden: ({ document }) => document?.status !== 'approved' && document?.status !== 'completed',
        }),
        defineField({
            name: 'completedAt',
            title: 'Completed At',
            type: 'datetime',
            description: 'Date when the adjustment was marked as completed',
        }),
        defineField({
            name: 'notes',
            title: 'Notes',
            type: 'text',
            rows: 3,
            description: 'Additional details about the adjustment.',
        }),
        defineField({
            name: 'attachments',
            title: 'Attachments',
            type: 'array',
            of: [{ type: 'reference', to: [{ type: 'FileAttachment' }] }],
            description: 'Related documents like photos, reports, etc.',
        }),
    ],
    preview: {
        select: {
            title: 'adjustmentNumber',
            date: 'adjustmentDate',
            bin: 'bin.name',
            type: 'adjustmentType',
            status: 'status',
            adjustedBy: 'adjustedBy.name',
        },
        prepare({ title, date, bin, type, status, adjustedBy }) {
            return {
                title: `Adjustment: ${title}`,
                subtitle: `${date ? new Date(date).toLocaleDateString() : 'No date'} | Bin: ${bin || 'No bin'} | Type: ${type || 'No type'} | By: ${adjustedBy || 'Unknown'} | Status: ${status || 'No status'}`,
            };
        },
    },
    orderings: [
        {
            name: 'newest',
            title: 'Newest First',
            by: [{ field: 'adjustmentDate', direction: 'desc' }],
        },
        {
            name: 'oldest',
            title: 'Oldest First',
            by: [{ field: 'adjustmentDate', direction: 'asc' }],
        },
        {
            name: 'adjustmentNumberAsc',
            title: 'Adjustment Number (Ascending)',
            by: [{ field: 'adjustmentNumber', direction: 'asc' }],
        },
        {
            name: 'status',
            title: 'Status',
            by: [{ field: 'status', direction: 'asc' }],
        },
    ],
});