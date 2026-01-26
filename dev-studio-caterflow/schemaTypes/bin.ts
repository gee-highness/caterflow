// schemas/bin.js
import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'Bin',
    title: 'Storage Bin',
    type: 'document',
    fields: [
        defineField({
            name: 'name',
            title: 'Bin Name',
            type: 'string',
            validation: (Rule) => Rule.required(),
            description: 'e.g., Dry Goods Shelf, Cold Room 1',
        }),
        defineField({
            name: 'site',
            title: 'Associated Site',
            type: 'reference',
            to: [{ type: 'Site' }],
            validation: (Rule) => Rule.required(),
            description: 'The site this storage bin belongs to.',
        }),
        defineField({
            name: 'locationDescription',
            title: 'Specific Location',
            type: 'string',
            description: 'e.g., Shelf 3, Aisle 2 in the storeroom.',
        }),
        defineField({
            name: 'capacity',
            title: 'Capacity (Optional)',
            type: 'number',
            description: 'Maximum capacity (e.g., in cubic meters or total items).',
            validation: (Rule) => Rule.min(0),
        }),
        defineField({
            name: 'binType',
            title: 'Bin Type',
            type: 'string',
            options: {
                list: [
                    { title: 'Main Storage', value: 'main-storage' },
                    { title: 'Overflow Storage', value: 'overflow-storage' },
                    { title: 'Refrigerator', value: 'refrigerator' },
                    { title: 'Freezer', value: 'freezer' },
                    { title: 'Dispensing Point', value: 'dispensing-point' },
                    { title: 'Receiving Area', value: 'receiving-area' },
                ],
            },
            validation: (Rule) => Rule.required(),
        }),
    ],
    preview: {
        select: {
            title: 'name',
            subtitle: 'site.name',
        },
        prepare({ title, subtitle }) {
            return {
                title: title,
                subtitle: subtitle ? `Site: ${subtitle}` : '',
            };
        },
        orderings: [
            {
                name: 'nameAsc',
                title: 'Bin Name (A-Z)',
                by: [{ field: 'name', direction: 'asc' }],
            },
            {
                name: 'nameDesc',
                title: 'Bin Name (Z-A)',
                by: [{ field: 'name', direction: 'desc' }],
            },
            {
                name: 'binTypeAsc',
                title: 'Bin Type (A-Z)',
                by: [{ field: 'binType', direction: 'asc' }],
            },
            {
                name: 'capacityDesc',
                title: 'Capacity (High to Low)',
                by: [{ field: 'capacity', direction: 'desc' }],
            },
            {
                name: 'createdAt',
                title: 'Newest First',
                by: [{ field: '_createdAt', direction: 'desc' }],
            },
        ],
    },
});