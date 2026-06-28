async function run() {
  const base = process.env.BASE_URL || "http://localhost:3000";
  const url = `${base}/api/archive/cron/resume`;
  const secret = process.env.CRON_SECRET || "";
  const hdr = secret ? { "x-cron-secret": `Bearer ${secret}` } : {};

  console.log("Posting to", url);

  try {
    const res = await fetch(url, { method: "POST", headers: hdr });
    const body = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", JSON.stringify(body, null, 2));
  } catch (err) {
    console.error("Failed to call resume endpoint:", err);
    process.exit(1);
  }
}

if (typeof require !== "undefined" && require.main === module) run();

module.exports = run;
