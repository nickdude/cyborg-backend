const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl: awsGetSignedUrl } = require("@aws-sdk/s3-request-presigner");

/**
 * Cloudflare R2 storage service.
 *
 * R2 is S3-compatible, so we use the AWS SDK v3 with region=auto and a custom
 * endpoint. Public access is gated in the Cloudflare dashboard per-bucket;
 * when enabled, objects are reachable at a public r2.dev subdomain — we read
 * that base URL from R2_PUBLIC_URL_BASE.
 *
 * Required env:
 *   R2_ACCOUNT_ID         — Cloudflare account ID
 *   R2_ACCESS_KEY_ID      — from R2 > Manage R2 API Tokens
 *   R2_SECRET_ACCESS_KEY  — from R2 > Manage R2 API Tokens
 *   R2_BUCKET             — bucket name (e.g. "cyborg-uploads")
 *   R2_PUBLIC_URL_BASE    — public URL base, e.g. "https://pub-xxxxx.r2.dev"
 */

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_URL_BASE,
} = process.env;

let _client = null;
let _warned = false;

function isConfigured() {
  return Boolean(
    R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET
  );
}

function getClient() {
  if (_client) return _client;
  if (!isConfigured()) {
    if (!_warned) {
      console.warn(
        "[Storage] R2 is not configured — missing one of R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET. Upload operations will fail."
      );
      _warned = true;
    }
    throw new Error("R2 storage is not configured (check .env)");
  }
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    // R2 doesn't support AWS SDK v3's default CRC32 flexible-checksum algorithm.
    // These two options fall back to the older MD5 behaviour that R2 accepts.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return _client;
}

/**
 * Upload a buffer to R2 at `key`. Returns { key, publicUrl }.
 * `mimeType` is stored as Content-Type so browsers render PDFs/images inline.
 */
async function uploadBuffer(key, buffer, mimeType) {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType || "application/octet-stream",
    })
  );
  return { key, publicUrl: getPublicUrl(key) };
}

/**
 * Build a public URL for a key. Returns null if R2_PUBLIC_URL_BASE isn't set
 * (caller should fall back to getSignedUrl for private access).
 */
function getPublicUrl(key) {
  if (!key) return null;
  if (!R2_PUBLIC_URL_BASE) return null;
  const base = R2_PUBLIC_URL_BASE.replace(/\/+$/, "");
  return `${base}/${encodeURI(key)}`;
}

/**
 * Generate a short-lived signed URL for private access. Default 1 hour.
 */
async function getSignedUrl(key, expiresIn = 3600) {
  const client = getClient();
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
  return awsGetSignedUrl(client, cmd, { expiresIn });
}

async function deleteObject(key) {
  if (!key) return;
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })
  );
}

/**
 * Returns true if an object exists at `key`. Any non-404 error is rethrown.
 */
async function keyExists(key) {
  if (!key) return false;
  const client = getClient();
  try {
    await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404 || err?.name === "NotFound") return false;
    throw err;
  }
}

module.exports = {
  isConfigured,
  uploadBuffer,
  getPublicUrl,
  getSignedUrl,
  deleteObject,
  keyExists,
};
