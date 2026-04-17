require("dotenv").config();
const { S3Client, ListBucketsCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const storage = require("../src/services/storage");

async function main() {
  if (!storage.isConfigured()) {
    console.error("FAIL: R2 not configured — check .env");
    process.exit(1);
  }

  console.log(`[pre] Endpoint: https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
  console.log(`[pre] Bucket: ${process.env.R2_BUCKET}`);
  console.log(`[pre] Access Key ID: ${process.env.R2_ACCESS_KEY_ID?.slice(0, 8)}...`);

  // Test: list buckets with raw SDK
  const rawClient = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  try {
    const res = await rawClient.send(new ListBucketsCommand({}));
    console.log(`[pre] ListBuckets OK:`, res.Buckets?.map((b) => b.Name));
  } catch (e) {
    console.error(`[pre] ListBuckets FAILED:`, e.message, "| code:", e.Code, "| status:", e.$metadata?.httpStatusCode);
  }
  const key = `smoke-test/${Date.now()}.txt`;
  const body = Buffer.from("hello from cyborg smoke test\n", "utf-8");

  console.log(`[1/4] Uploading ${key}...`);
  await storage.uploadBuffer(key, body, "text/plain");
  console.log(`      ok`);

  console.log(`[2/4] Verifying key exists...`);
  const exists = await storage.keyExists(key);
  if (!exists) {
    console.error("FAIL: key not found after upload");
    process.exit(1);
  }
  console.log(`      ok (exists=${exists})`);

  console.log(`[3/4] Generating signed URL...`);
  const url = await storage.getSignedUrl(key, 300);
  console.log(`      ok (${url.slice(0, 80)}...)`);

  console.log(`[4/4] Deleting ${key}...`);
  await storage.deleteObject(key);
  const stillThere = await storage.keyExists(key);
  if (stillThere) {
    console.error("FAIL: key still exists after delete");
    process.exit(1);
  }
  console.log(`      ok (deleted)`);

  console.log("\nALL PASS — R2 is working.");
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  console.error(err);
  process.exit(1);
});
