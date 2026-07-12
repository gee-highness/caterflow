#!/usr/bin/env node
// Print counts for archive collections
const { MongoClient } = require("mongodb");
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URL || "";
const DATABASE_NAME =
  process.env.DATABASE_NAME ||
  process.env.MONGODB_DB_NAME ||
  "caterflow_archive";

if (!MONGODB_URI) {
  console.error("MONGODB_URI not set");
  process.exit(2);
}

const COLLECTIONS = [
  "archived_dispatch_logs",
  "archived_purchase_orders",
  "archived_goods_receipts",
  "archived_internal_transfers",
  "archived_stock_adjustments",
  "archived_inventory_counts",
  "archived_file_attachments",
  "archived_stock_snapshots",
  "archive_runs",
];

(async () => {
  const client = new MongoClient(MONGODB_URI, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db(DATABASE_NAME);
  for (const col of COLLECTIONS) {
    try {
      const count = await db.collection(col).countDocuments();
      console.log(`${col}: ${count}`);
    } catch (e) {
      console.log(`${col}: error (${String(e.message)})`);
    }
  }
  await client.close();
})();
