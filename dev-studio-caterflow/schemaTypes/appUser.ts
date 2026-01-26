// schemas/appUser.js
import { defineType, defineField, ValidationContext } from 'sanity';

// NOTE: This helper function is defined locally for clarity.
// In a real project, you might place this in a separate utilities file.
const isUniqueEmail = async (email: string | undefined, context: ValidationContext) => {
    const { document, getClient } = context;
    if (!email) {
        return true;
    }

    // Get the ID of the document being edited, ignoring the 'drafts' part.
    const id = document._id.replace('drafts.', '');

    // Get the Sanity client instance.
    const client = getClient({ apiVersion: '2025-08-20' });

    // Construct a GROQ query to check for documents with the same email.
    // It excludes the current document (both the draft and the published version).
    const query = `
        !defined(*[_type == "AppUser" && email == $email && _id != $draft && _id != $published][0]._id)
    `;

    const params = {
        draft: `drafts.${id}`,
        published: id,
        email,
    };

    const result = await client.fetch(query, params);
    return result;
};

export default defineType({
    name: 'AppUser',
    title: 'Application User',
    type: 'document',
    fields: [
        defineField({
            name: 'name',
            title: 'Full Name',
            type: 'string',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'email',
            title: 'Email Address',
            type: 'string',
            validation: (Rule) =>
                Rule.required().custom(async (email, context) => {
                    const isEmailUnique = await isUniqueEmail(email, context);

                    if (!isEmailUnique) {
                        return 'Email already exists.';
                    }
                    return true;
                }),
            description: 'Must be unique and correspond to the user\'s login email in your Next.js app.',
        }),
        defineField({
            name: 'password',
            title: 'Password',
            type: 'string',
            hidden: true, // This makes the field hidden in the Studio
            description: 'Hashed password for authentication. This field is automatically managed.',
        }),
        defineField({
            name: 'role',
            title: 'User Role',
            type: 'string',
            options: {
                list: [
                    { title: 'Admin', value: 'admin' },
                    { title: 'Site Manager', value: 'siteManager' },
                    { title: 'Stock Controller', value: 'stockController' },
                    { title: 'Dispatch Staff', value: 'dispatchStaff' },
                    { title: 'Auditor', value: 'auditor' },
                ],
            },
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'associatedSite',
            title: 'Associated Site',
            type: 'reference',
            to: [{ type: 'Site' }],
            description: 'For Site Managers, links them to their specific site; optional for others.',
        }),
        defineField({
            name: 'isActive',
            title: 'Is Active',
            type: 'boolean',
            description: 'Whether this user account is active in the application.',
            initialValue: true,
        }),
        defineField({
            name: 'profileImage',
            title: 'Profile Image',
            type: 'image',
            options: {
                hotspot: true,
            },
        }),
    ],
    preview: {
        select: {
            title: 'name',
            subtitle: 'role',
            media: 'profileImage',
        },
        prepare({ title, subtitle, media }) {
            return {
                title: title,
                subtitle: `Role: ${subtitle}`,
                media: media,
            };
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
                name: 'role',
                title: 'Role',
                by: [{ field: 'role', direction: 'asc' }],
            },
            {
                name: 'email',
                title: 'Email',
                by: [{ field: 'email', direction: 'asc' }],
            },
        ],
    },
});