// schemas/category.js
import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'Category',
    title: 'Category',
    type: 'document',
    fields: [
        defineField({
            name: 'title',
            title: 'Category Title',
            type: 'string',
            validation: (Rule) => Rule.required(),
            description: 'e.g., Perishables, Dry Goods, Cleaning Materials',
        }),
        defineField({
            name: 'description',
            title: 'Description',
            type: 'text',
            rows: 2,
        }),
    ],
    preview: {
        select: {
            title: 'title',
        },
        orderings: [
            {
                name: 'titleAsc',
                title: 'Title (A-Z)',
                by: [{ field: 'title', direction: 'asc' }],
            },
            {
                name: 'titleDesc',
                title: 'Title (Z-A)',
                by: [{ field: 'title', direction: 'desc' }],
            },
            {
                name: 'createdAt',
                title: 'Newest First',
                by: [{ field: '_createdAt', direction: 'desc' }],
            },
        ],
    },
});