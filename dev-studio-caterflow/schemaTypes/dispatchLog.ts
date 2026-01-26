// schemas/dispatchLog.ts
import { defineType, defineField, ValidationContext } from 'sanity';
import client from '../lib/client';

const isUniqueDispatchNumber = async (dispatchNumber: string | undefined, context: ValidationContext) => {
    const { document, getClient } = context;
    if (!dispatchNumber) {
        return true;
    }

    const id = document?._id.replace('drafts.', '');
    const client = getClient({ apiVersion: '2025-08-20' });

    const query = `
        !defined(*[_type == "DispatchLog" && dispatchNumber == $dispatchNumber && _id != $draft && _id != $published][0]._id)
    `;

    const params = {
        draft: `drafts.${id}`,
        published: id,
        dispatchNumber,
    };

    const result = await client.fetch(query, params);
    return result;
};

export default defineType({
    name: 'DispatchLog',
    title: 'Dispatch Log',
    type: 'document',
    fields: [
        defineField({
            name: 'dispatchNumber',
            title: 'Dispatch Number',
            type: 'string',
            validation: (Rule) =>
                Rule.required().custom(async (dispatchNumber, context) => {
                    const isUnique = await isUniqueDispatchNumber(dispatchNumber, context);
                    if (!isUnique) {
                        return 'Dispatch Number already exists.';
                    }
                    return true;
                }),
            readOnly: ({ document }) => !!document?.dispatchNumber,
            description: 'Unique Dispatch Log identifier.',
            initialValue: async () => {
                const today = new Date().toISOString().slice(0, 10);
                const query = `
                    *[_type == "DispatchLog" && _createdAt >= "${today}T00:00:00Z" && _createdAt < "${today}T23:59:59Z"] | order(_createdAt desc)[0] {
                        dispatchNumber
                    }
                `;
                const lastLog = await client.fetch(query);

                let nextNumber = 1;
                if (lastLog && lastLog.dispatchNumber) {
                    const lastNumber = parseInt(lastLog.dispatchNumber.split('-').pop());
                    if (!isNaN(lastNumber)) {
                        nextNumber = lastNumber + 1;
                    }
                }

                const paddedNumber = String(nextNumber).padStart(3, '0');
                return `DL-${today}-${paddedNumber}`;
            },
        }),
        defineField({
            name: 'status',
            title: 'Status',
            type: 'string',
            options: {
                list: [
                    { title: 'Draft', value: 'draft' },
                    { title: 'Scheduled', value: 'scheduled' },
                    { title: 'In Progress', value: 'in-progress' },
                    { title: 'Completed', value: 'completed' },
                    { title: 'Cancelled', value: 'cancelled' },
                ],
            },
            initialValue: 'draft',
            validation: (Rule) => Rule.required(),
            description: 'Overall status of the dispatch',
        }),
        defineField({
            name: 'dispatchType',
            title: 'Dispatch Type',
            type: 'reference',
            to: [{ type: 'DispatchType' }],
            validation: (Rule) => Rule.required(),
            description: 'Type of dispatch (Breakfast, Lunch, Supper, etc.)',
        }),
        defineField({
            name: 'dispatchDate',
            title: 'Dispatch Date',
            type: 'datetime',
            options: {
                dateFormat: 'YYYY-MM-DD',
                timeFormat: 'HH:mm',
                calendarTodayLabel: 'Today',
            },
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'sourceSite',
            title: 'Source Sitte',
            type: 'reference',
            to: [{ type: 'Site' }],
            validation: (Rule) => Rule.required(),
            description: 'The bin from which stock was dispatched.',
        }),
        defineField({
            name: 'dispatchedBy',
            title: 'Dispatched By',
            type: 'reference',
            to: [{ type: 'AppUser' }],
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'dispatchedItems',
            title: 'Dispatched Items',
            type: 'array',
            of: [{ type: 'DispatchedItem' }],
            validation: (Rule) => Rule.required().min(1),
        }),
        defineField({
            name: 'attachments',
            title: 'Attachments',
            type: 'array',
            of: [{ type: 'reference', to: [{ type: 'FileAttachment' }] }],
            description: 'Related documents like delivery notes, proof of delivery, etc.',
        }),
        defineField({
            name: 'evidenceStatus',
            title: 'Evidence Status',
            type: 'string',
            options: {
                list: [
                    { title: 'Pending Dispatch', value: 'pending' },
                    { title: 'Partial', value: 'partial' },
                    { title: 'Complete', value: 'complete' },
                ],
            },
            initialValue: 'pending',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'totalCost',
            title: 'Total Dispatch Cost',
            type: 'number',
            description: 'Total cost of all dispatched items',
            readOnly: true,
        }),
        defineField({
            name: 'costPerPerson',
            title: 'Cost Per Person',
            type: 'number',
            description: 'Total cost divided by number of people fed',
            readOnly: true,
        }),
        defineField({
            name: 'completedAt',
            title: 'Completed At',
            type: 'datetime',
            description: 'Date when the dispatch was marked as completed',
        }),
        defineField({
            name: 'peopleFed',
            title: 'Number of People Fed',
            type: 'number',
            description: 'The number of people who benefited from this dispatch.',
            validation: (Rule) => Rule.integer().min(0),
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
            title: 'dispatchNumber',
            date: 'dispatchDate',
            type: 'dispatchType.name',
            source: 'sourceSite.name',
            status: 'status',
            evidenceStatus: 'evidenceStatus',
            peopleFed: 'peopleFed',
        },
        prepare({ title, date, type, source, status, evidenceStatus, peopleFed }) {
            const statusText = status ? ` | Status: ${status}` : '';
            const evidenceText = evidenceStatus ? ` | Evidence: ${evidenceStatus}` : '';
            const typeText = type ? ` | Type: ${type}` : '';
            const peopleText = peopleFed ? ` | Fed: ${peopleFed} people` : '';
            return {
                title: `Dispatch: ${title}`,
                subtitle: `${date ? new Date(date).toLocaleDateString() : 'No date'}${typeText} | From: ${source || 'No source'}${peopleText}${statusText}${evidenceText}`,
            };
        },
    },
    orderings: [
        {
            name: 'newest',
            title: 'Newest First',
            by: [{ field: 'dispatchDate', direction: 'desc' }],
        },
        {
            name: 'oldest',
            title: 'Oldest First',
            by: [{ field: 'dispatchDate', direction: 'asc' }],
        },
        {
            name: 'dispatchNumberAsc',
            title: 'Dispatch Number (Ascending)',
            by: [{ field: 'dispatchNumber', direction: 'asc' }],
        },
        {
            name: 'dispatchType',
            title: 'Dispatch Type',
            by: [{ field: 'dispatchType.name', direction: 'asc' }],
        },
        {
            name: 'status',
            title: 'Status',
            by: [{ field: 'status', direction: 'asc' }],
        },
    ],
});