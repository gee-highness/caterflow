// schemas/supplier.js
import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'Supplier',
    title: 'Supplier',
    type: 'document',
    fields: [
        defineField({
            name: 'name',
            title: 'Supplier Name',
            type: 'string',
            validation: (Rule) => Rule.required().unique(),
        }),
        defineField({
            name: 'contactPerson',
            title: 'Contact Person',
            type: 'string',
        }),
        defineField({
            name: 'phoneNumber',
            title: 'Phone Number',
            type: 'string',
        }),
        defineField({
            name: 'email',
            title: 'Email Address',
            type: 'string',
        }),
        defineField({
            name: 'address',
            title: 'Address',
            type: 'text',
            rows: 3,
        }),
        defineField({
            name: 'terms',
            title: 'Payment Terms',
            type: 'string',
            description: 'e.g., Net 30 days, Cash on Delivery',
        }),
    ],
    preview: {
        select: {
            title: 'name',
            subtitle: 'contactPerson',
        },
        orderings: [
            {
                name: 'nameAsc',
                title: 'Name (A-Z)',
                by: [{ field: 'name', direction: 'asc' }],
            },
            {
                name: 'nameDesc',
                title: 'Name (Z-A)',
                by: [{ field: 'name', direction: 'desc' }],
            },
            {
                name: 'createdAt',
                title: 'Newest First',
                by: [{ field: '_createdAt', direction: 'desc' }],
            },
        ],
    },
});