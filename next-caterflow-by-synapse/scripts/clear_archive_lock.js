async function run() {
  const base = process.env.BASE_URL || "http://localhost:3000";
  const url = `${base}/api/archive/lock/clear`;
  const secret = process.env.CRON_SECRET || process.env.ADMIN_SECRET || "";
  const hdr = secret ? { "x-admin-secret": `Bearer ${secret}` } : {};

  console.log("Posting to", url);

  try {
    const res = await fetch(url, { method: "POST", headers: hdr });
    const body = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", JSON.stringify(body, null, 2));
  } catch (err) {
    console.error("Failed to call clear lock endpoint:", err);
    process.exit(1);
  }
}

if (typeof require !== "undefined" && require.main === module) run();

module.exports = run;
