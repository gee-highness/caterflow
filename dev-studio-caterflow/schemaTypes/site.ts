// schemas/site.js
import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'Site',
    title: 'Site',
    type: 'document',
    fields: [
        defineField({
            name: 'name',
            title: 'Site Name',
            type: 'string',
            validation: (Rule) => Rule.required(),
            description: 'e.g., Kitchen A, Ward 3 Pantry',
        }),
        defineField({
            name: 'code',
            title: 'Slug',
            type: 'slug',
            options: {
                source: 'name', // Automatically generate the code from the 'name' field
                maxLength: 96,
                slugify: (input) => input
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .slice(0, 200)
            },
            validation: (Rule) => Rule.required(),
            description: 'A unique short code for the site.',
            //readOnly: true, // Prevents manual changes to the code
        }),
        defineField({
            name: 'location',
            title: 'Location Description',
            type: 'string',
            description: 'Physical address or area of the site.',
        }),
        defineField({
            name: 'manager',
            title: 'Assigned Manager',
            type: 'reference',
            to: [{ type: 'AppUser' }],
            description: 'The primary manager for this site.',
        }),
        defineField({
            name: 'contactNumber',
            title: 'Contact Number',
            type: 'string',
        }),
        defineField({
            name: 'email',
            title: 'Email Address',
            type: 'string',
        }),
        defineField({
            name: 'patientCount',
            title: 'Current Patient Count',
            type: 'number',
            description: 'Number of patients requiring meals (can influence stock needs).',
            validation: (Rule) => Rule.min(0).integer(),
        }),
    ],
    preview: {
        select: {
            title: 'name',
            subtitle: 'code.current',
        },
        orderings: [
            {
                name: 'nameAsc',
                title: 'Site Name (A-Z)',
                by: [{ field: 'name', direction: 'asc' }],
            },
            {
                name: 'nameDesc',
                title: 'Site Name (Z-A)',
                by: [{ field: 'name', direction: 'desc' }],
            },
            {
                name: 'codeAsc',
                title: 'Site Code (Ascending)',
                by: [{ field: 'code.current', direction: 'asc' }],
            },
            {
                name: 'patientCountDesc',
                title: 'Patient Count (High to Low)',
                by: [{ field: 'patientCount', direction: 'desc' }],
            },
            {
                name: 'createdAt',
                title: 'Newest First',
                by: [{ field: '_createdAt', direction: 'desc' }],
            },
        ],
    },
});