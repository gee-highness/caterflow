// schemas/notificationPreference.js
import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'NotificationPreference',
    title: 'Notification Preference',
    type: 'document',
    fields: [
        defineField({
            name: 'title',
            title: 'Notification Type Title',
            type: 'string',
            validation: (Rule) => Rule.required(),
            description: 'e.g., Low Stock Alert, Item Expiry Warning',
        }),
        defineField({
            name: 'description',
            title: 'Description',
            type: 'text',
            rows: 2,
        }),
        defineField({
            name: 'isEnabled',
            title: 'Is Enabled',
            type: 'boolean',
            description: 'Toggle whether this type of notification is active system-wide.',
            initialValue: true,
        }),
        defineField({
            name: 'thresholdValue',
            title: 'Threshold Value',
            type: 'number',
            description: 'e.g., for low stock, specify the quantity; for expiry, specify days in advance.',
            validation: (Rule) => Rule.min(0),
        }),
        defineField({
            name: 'notificationChannels',
            title: 'Notification Channels',
            type: 'array',
            of: [{ type: 'string' }],
            options: {
                list: [
                    { title: 'Email', value: 'email' },
                    { title: 'SMS', value: 'sms' },
                    { title: 'In-App Notification', value: 'in-app' },
                ],
                layout: 'checkbox',
            },
            validation: (Rule) => Rule.required().min(1),
            description: 'Channels through which this notification will be sent.',
        }),
        defineField({
            name: 'appliesToRoles',
            title: 'Applies to Roles',
            type: 'array',
            of: [{ type: 'string' }],
            options: {
                list: [
                    { title: 'Admin', value: 'admin' },
                    { title: 'Site Manager', value: 'siteManager' },
                    { title: 'Stock Controller', value: 'stockController' },
                    { title: 'Dispatch Staff', value: 'dispatchStaff' },
                    { title: 'Auditor', value: 'auditor' },
                ],
                layout: 'checkbox', // Changed to checkbox layout
            },
            validation: (Rule) => Rule.required().min(1),
            description: 'Which application user roles should receive this notification.',
        }),
    ],
    preview: {
        select: {
            title: 'title',
            isEnabled: 'isEnabled',
        },
        prepare({ title, isEnabled }) {
            return {
                title: title,
                subtitle: isEnabled ? 'Enabled' : 'Disabled',
            };
        },
        orderings: [
            {
                name: 'titleAsc',
                title: 'Title (A-Z)',
                by: [{ field: 'title', direction: 'asc' }],
            },
            {
                name: 'isEnabledDesc',
                title: 'Enabled First',
                by: [{ field: 'isEnabled', direction: 'desc' }],
            },
            {
                name: 'createdAt',
                title: 'Newest First',
                by: [{ field: '_createdAt', direction: 'desc' }],
            },
        ],
    },
});