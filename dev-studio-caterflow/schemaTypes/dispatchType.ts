// schemas/dispatchType.ts (REPLACE ENTIRE FILE)
import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'DispatchType',
    title: 'Dispatch Type',
    type: 'document',
    fields: [
        defineField({
            name: 'name',
            title: 'Dispatch Type Name',
            type: 'string',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'description',
            title: 'Description',
            type: 'text',
            rows: 3,
        }),
        defineField({
            name: 'defaultTime',
            title: 'Default Time',
            type: 'string',
            description: 'Default time for this dispatch type (e.g., "07:00" for Breakfast)',
        }),
        defineField({
            name: 'isActive',
            title: 'Active',
            type: 'boolean',
            initialValue: true,
            description: 'Whether this dispatch type is currently active',
        }),
        defineField({
            name: 'sellingPrice',
            title: 'Default Selling Price',
            type: 'number',
            description: 'Default price per person for this dispatch type (used if no site-specific price is set)',
            validation: (Rule) => Rule.min(0),
        }),
        defineField({
            name: 'sitePrices',
            title: 'Site-Specific Prices',
            type: 'array',
            of: [{
                type: 'object',
                fields: [
                    {
                        name: 'site',
                        title: 'Site',
                        type: 'reference',
                        to: [{ type: 'Site' }],
                        validation: (Rule) => Rule.required()
                    },
                    {
                        name: 'price',
                        title: 'Price per Person',
                        type: 'number',
                        validation: (Rule) => Rule.required().min(0)
                    }
                ],
                preview: {
                    select: {
                        title: 'site.name',
                        price: 'price'
                    },
                    prepare({ title, price }) {
                        return {
                            title: title,
                            subtitle: `E ${price} per person`
                        };
                    }
                }
            }],
            description: 'Site-specific pricing overrides. Leave empty to use default price for all sites.',
        }),
    ],
    preview: {
        select: {
            title: 'name',
            subtitle: 'description',
        },
        prepare({ title, subtitle }) {
            return {
                title: title,
                subtitle: subtitle || 'No description',
            };
        },
    },
});