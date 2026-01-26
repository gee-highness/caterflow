// deleteSnapshots.js
import { createClient } from '@sanity/client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const client = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'your-project-id',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  apiVersion: '2025-08-20',
  token: process.env.SANITY_API_TOKEN || 'your-token', // Get from https://www.sanity.io/manage
  useCdn: false
});

async function deleteAllStockSnapshots() {
  console.log('🔍 Fetching all stock snapshots...');
  
  try {
    // Fetch all stock snapshot IDs
    const query = '*[_type == "stockSnapshot"]{_id}';
    const snapshots = await client.fetch(query);
    
    if (!snapshots || snapshots.length === 0) {
      console.log('✅ No stock snapshots found');
      return;
    }
    
    console.log(`📊 Found ${snapshots.length} stock snapshots to delete`);
    
    // Delete in batches of 50
    const batchSize = 50;
    for (let i = 0; i < snapshots.length; i += batchSize) {
      const batch = snapshots.slice(i, i + batchSize);
      
      const transaction = client.transaction();
      batch.forEach(doc => {
        transaction.delete(doc._id);
      });
      
      await transaction.commit();
      console.log(`🗑️  Deleted ${Math.min(i + batchSize, snapshots.length)}/${snapshots.length}`);
      
      // Small delay to avoid rate limiting
      if (i + batchSize < snapshots.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('🎉 All stock snapshots deleted successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

deleteAllStockSnapshots();