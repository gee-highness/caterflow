// schemas/internalTransfer.ts
import { defineType, defineField } from 'sanity';
import client from '../lib/client';

const isUniqueTransferNumber = async (transferNumber, context) => {
    const { document, getClient } = context;
    if (!transferNumber) {
        return true;
    }

    const id = document._id.replace('drafts.', '');
    const client = getClient({ apiVersion: '2025-08-20' });

    const query = `
        !defined(*[_type == "InternalTransfer" && transferNumber == $transferNumber && _id != $draft && _id != $published][0]._id)
    `;

    const params = {
        draft: `drafts.${id}`,
        published: id,
        transferNumber,
    };

    const result = await client.fetch(query, params);
    return result;
};

export default defineType({
    name: 'InternalTransfer',
    title: 'Internal Stock Transfer',
    type: 'document',
    fields: [
        defineField({
            name: 'transferNumber',
            title: 'Transfer Number',
            type: 'string',
            validation: (Rule) =>
                Rule.required().custom(async (transferNumber, context) => {
                    const isUnique = await isUniqueTransferNumber(transferNumber, context);
                    if (!isUnique) {
                        return 'Transfer Number already exists.';
                    }
                    return true;
                }),
            readOnly: ({ document }) => !!document?.transferNumber,
            description: 'Unique Internal Transfer identifier.',
            initialValue: async () => {
                const today = new Date().toISOString().slice(0, 10);
                const query = `
                    *[_type == "InternalTransfer" && _createdAt >= "${today}T00:00:00Z" && _createdAt < "${today}T23:59:59Z"] | order(_createdAt desc)[0] {
                        transferNumber
                    }
                `;
                const lastTransfer = await client.fetch(query);

                let nextNumber = 1;
                if (lastTransfer && lastTransfer.transferNumber) {
                    const lastNumber = parseInt(lastTransfer.transferNumber.split('-').pop());
                    if (!isNaN(lastNumber)) {
                        nextNumber = lastNumber + 1;
                    }
                }

                const paddedNumber = String(nextNumber).padStart(3, '0');
                return `TR-${today}-${paddedNumber}`;
            },
        }),
        defineField({
            name: 'transferDate',
            title: 'Transfer Date',
            type: 'datetime',
            initialValue: new Date().toISOString(),
            options: {
                dateFormat: 'YYYY-MM-DD',
                calendarTodayLabel: 'Today',
            },
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'fromBin',
            title: 'From Bin',
            type: 'reference',
            to: [{ type: 'Bin' }],
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'toBin',
            title: 'To Bin',
            type: 'reference',
            to: [{ type: 'Bin' }],
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'transferredBy',
            title: 'Transferred By',
            type: 'reference',
            to: [{ type: 'AppUser' }],
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'transferredItems',
            title: 'Transferred Items',
            type: 'array',
            of: [{ type: 'TransferredItem' }],
            validation: (Rule) => Rule.required().min(1),
        }),
        defineField({
            name: 'notes',
            title: 'Notes',
            type: 'text',
            rows: 3,
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
    ],
    preview: {
        select: {
            title: 'transferNumber',
            date: 'transferDate',
            from: 'fromBin.name',
            to: 'toBin.name',
            status: 'status',
        },
        prepare({ title, date, from, to, status }) {
            return {
                title: `Transfer: ${title}`,
                subtitle: `${date ? new Date(date).toLocaleDateString() : 'No date'} | ${from || 'No source'} -> ${to || 'No destination'} | Status: ${status || 'No status'}`,
            };
        },
    },
    orderings: [
        {
            name: 'newest',
            title: 'Newest First',
            by: [{ field: 'transferDate', direction: 'desc' }],
        },
        {
            name: 'oldest',
            title: 'Oldest First',
            by: [{ field: 'transferDate', direction: 'asc' }],
        },
        {
            name: 'transferNumberAsc',
            title: 'Transfer Number (Ascending)',
            by: [{ field: 'transferNumber', direction: 'asc' }],
        },
        {
            name: 'status',
            title: 'Status',
            by: [{ field: 'status', direction: 'asc' }],
        },
    ],
});