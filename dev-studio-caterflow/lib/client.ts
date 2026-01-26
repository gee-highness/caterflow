import { createClient } from '@sanity/client';

// Create a single shared client instance
export const client = createClient({
    projectId: 'ml4r1dn2',
    dataset: 'production',
    apiVersion: '2025-08-20',
    useCdn: true,
});

export default client;