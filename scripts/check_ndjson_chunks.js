#!/usr/bin/env node
// Chunked NDJSON checker
// Usage: node scripts/check_ndjson_chunks.js /path/to/data.ndjson [chunkSize]

const fs = require("fs");
const readline = require("readline");
const path = require("path");

async function checkBatch(batch, batchIndex) {
  // Placeholder check: parse each JSON and return summary
  // Replace this with your actual check logic (DB lookups, validations, etc.)
  let parsed = 0;
  let errors = 0;
  for (const line of batch) {
    try {
      JSON.parse(line);
      parsed += 1;
    } catch (e) {
      errors += 1;
    }
  }
  return { batchIndex, parsed, errors, total: batch.length };
}

async function processFile(filePath, chunkSize = 5000) {
  if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    process.exit(2);
  }

  const inStream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: inStream, crlfDelay: Infinity });

  let batch = [];
  let lineCount = 0;
  let batchIndex = 0;
  let totalParsed = 0;
  let totalErrors = 0;

  console.log(
    `Processing ${path.basename(filePath)} in chunks of ${chunkSize} lines...`,
  );

  for await (const line of rl) {
    if (!line.trim()) continue;
    batch.push(line);
    lineCount += 1;

    if (batch.length >= chunkSize) {
      const res = await checkBatch(batch, batchIndex);
      batchIndex += 1;
      totalParsed += res.parsed;
      totalErrors += res.errors;
      console.log(
        `Batch ${res.batchIndex}: parsed=${res.parsed} errors=${res.errors} total=${res.total}`,
      );
      batch = [];
    }
  }

  if (batch.length) {
    const res = await checkBatch(batch, batchIndex);
    totalParsed += res.parsed;
    totalErrors += res.errors;
    console.log(
      `Batch ${res.batchIndex}: parsed=${res.parsed} errors=${res.errors} total=${res.total}`,
    );
  }

  console.log("Finished. Lines processed:", lineCount);
  console.log("Total parsed:", totalParsed, "Total errors:", totalErrors);
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (!argv[0]) {
    console.error(
      "Usage: node scripts/check_ndjson_chunks.js /path/to/data.ndjson [chunkSize]",
    );
    process.exit(1);
  }
  const filePath = argv[0];
  const chunkSize = argv[1] ? parseInt(argv[1], 10) : 5000;
  processFile(filePath, chunkSize).catch((err) => {
    console.error("Error while processing file:", err);
    process.exit(3);
  });
}
