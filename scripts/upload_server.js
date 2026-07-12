#!/usr/bin/env node
// Simple upload + chunked NDJSON processor with SSE progress
// Usage:
// 1) npm install express busboy cors uuid mongodb
// 2) Set MONGODB_URI and optional DATABASE_NAME env vars
// 3) node scripts/upload_server.js
// 4) Open http://localhost:4000/upload.html in browser, start an SSE connection, then upload file.

const express = require("express");
const Busboy = require("busboy");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const readline = require("readline");
const stream = require("stream");
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const PORT = process.env.UPLOAD_SERVER_PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URL || "";
const DATABASE_NAME =
  process.env.DATABASE_NAME ||
  process.env.MONGODB_DB_NAME ||
  "caterflow_archive";

const app = express();
app.use(cors());
app.use(express.static(path.join(process.cwd(), "public")));

// SSE clients map: clientId -> res
const sseClients = new Map();

app.get("/events", (req, res) => {
  const clientId = req.query.clientId;
  if (!clientId) return res.status(400).end("clientId required");

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  res.write("retry: 10000\n\n");

  sseClients.set(clientId, res);
  req.on("close", () => {
    sseClients.delete(clientId);
  });
});

function sendProgress(clientId, payload) {
  const res = sseClients.get(clientId);
  if (!res) return;
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch (e) {
    // ignore
  }
}

// Map Sanity _type to archive Mongo collection names (mirror src/lib/mongoClient.ts)
const TYPE_TO_COLLECTION = {
  DispatchLog: "archived_dispatch_logs",
  PurchaseOrder: "archived_purchase_orders",
  GoodsReceipt: "archived_goods_receipts",
  InternalTransfer: "archived_internal_transfers",
  StockAdjustment: "archived_stock_adjustments",
  InventoryCount: "archived_inventory_counts",
  FileAttachment: "archived_file_attachments",
  stockSnapshot: "archived_stock_snapshots",
};

let mongoClient = null;
let archiveDb = null;
async function ensureMongo() {
  if (archiveDb) return archiveDb;
  if (!MONGODB_URI) throw new Error("MONGODB_URI not set");
  mongoClient = new MongoClient(MONGODB_URI, { useUnifiedTopology: true });
  await mongoClient.connect();
  archiveDb = mongoClient.db(DATABASE_NAME);
  return archiveDb;
}

async function checkBatch(batch, batchIndex) {
  // Parse lines into JSON documents
  const parsedItems = [];
  let errors = 0;
  for (const line of batch) {
    try {
      const doc = JSON.parse(line);
      parsedItems.push(doc);
    } catch (e) {
      errors += 1;
    }
  }

  if (!parsedItems.length)
    return { batchIndex, parsed: 0, errors, total: batch.length, inserted: 0 };

  const db = await ensureMongo();

  // Group by target collection
  const grouped = new Map();
  const unknownTypes = [];
  for (const doc of parsedItems) {
    const t = doc._type || doc.type;
    const coll = TYPE_TO_COLLECTION[t];
    if (!coll) {
      unknownTypes.push(t || null);
      continue;
    }
    if (!grouped.has(coll)) grouped.set(coll, []);
    grouped.get(coll).push(doc);
  }

  let totalInserted = 0;

  for (const [collName, docs] of grouped.entries()) {
    const collection = db.collection(collName);
    const sanityIds = docs.map((d) => d._sanityId || d._id).filter(Boolean);
    if (!sanityIds.length) continue;

    // Find which ids already exist
    const existing = await collection
      .find({ _sanityId: { $in: sanityIds } }, { projection: { _sanityId: 1 } })
      .toArray();
    const existingSet = new Set(existing.map((e) => e._sanityId));

    const missingDocs = docs.filter((d) => {
      const id = d._sanityId || d._id;
      return id && !existingSet.has(id);
    });

    if (!missingDocs.length) continue;

    // Prepare payloads for insertion
    const toInsert = missingDocs.map((d) => {
      const payload = { ...d };
      // sanitize
      delete payload._id;
      delete payload._rev;
      delete payload._updatedAt;
      payload._sanityId = d._sanityId || d._id;
      payload._isArchived = true;
      payload._archivedAt = new Date().toISOString();
      return payload;
    });

    try {
      const r = await collection.insertMany(toInsert, { ordered: false });
      totalInserted += r.insertedCount || toInsert.length;
    } catch (err) {
      // in case some inserts fail due to duplicates, attempt per-doc insert as fallback
      for (const doc of toInsert) {
        try {
          await collection.insertOne(doc);
          totalInserted += 1;
        } catch (e) {
          // skip duplicates or errors
        }
      }
    }
  }

  return {
    batchIndex,
    parsed: parsedItems.length,
    errors,
    total: batch.length,
    inserted: totalInserted,
  };
}

app.post("/upload", (req, res) => {
  const clientId = req.headers["x-client-id"] || req.query.clientId || uuidv4();

  const bb = Busboy({ headers: req.headers });

  let fileProcessed = false;
  let totalLines = 0;
  let totalParsed = 0;
  let totalErrors = 0;
  let totalInserted = 0;
  let chunkSize = parseInt(req.query.chunkSize || "5000", 10);

  bb.on("field", (name, val) => {
    if (name === "chunkSize") chunkSize = parseInt(val, 10) || chunkSize;
  });

  bb.on("file", (name, fileStream, info) => {
    const { filename } = info;
    // We'll stream the incoming file into a PassThrough and use readline to iterate
    const pass = new stream.PassThrough();
    fileStream.pipe(pass);

    const rl = readline.createInterface({ input: pass, crlfDelay: Infinity });

    let batch = [];
    let batchIndex = 0;

    (async () => {
      try {
        for await (const line of rl) {
          if (!line || !line.trim()) continue;
          batch.push(line);
          totalLines += 1;

          if (batch.length >= chunkSize) {
            const out = await checkBatch(batch, batchIndex);
            totalParsed += out.parsed;
            totalErrors += out.errors;
            totalInserted += out.inserted || 0;
            sendProgress(clientId, { type: "batch", filename, ...out });
            batchIndex += 1;
            batch = [];
          }
        }

        if (batch.length) {
          const out = await checkBatch(batch, batchIndex);
          totalParsed += out.parsed;
          totalErrors += out.errors;
          totalInserted += out.inserted || 0;
          sendProgress(clientId, { type: "batch", filename, ...out });
        }

        fileProcessed = true;
        sendProgress(clientId, {
          type: "done",
          filename,
          totalLines,
          totalParsed,
          totalErrors,
          totalInserted,
        });
        res.json({
          status: "ok",
          clientId,
          filename,
          totalLines,
          totalParsed,
          totalErrors,
          totalInserted,
        });
      } catch (err) {
        sendProgress(clientId, { type: "error", message: String(err) });
        res.status(500).json({ status: "error", message: String(err) });
      }
    })();
  });

  bb.on("close", () => {
    if (!fileProcessed) {
      // no file uploaded
      res.status(400).json({ status: "error", message: "No file uploaded" });
    }
  });

  req.pipe(bb);
});

app.listen(PORT, () => {
  console.log(`Upload server listening on http://localhost:${PORT}`);
  console.log("Upload form: http://localhost:" + PORT + "/upload.html");
});
