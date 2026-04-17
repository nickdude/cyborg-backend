const crypto = require("crypto");
const storage = require("../services/storage");
const {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

/**
 * Meal-image storage, backed by Cloudflare R2.
 *
 * Layout mirrors the previous disk layout so the mealController doesn't need
 * to know about cloud storage:
 *   meals/pending/<userId>/<timestamp>-<hash8>.<ext>
 *   meals/committed/<userId>/<timestamp>-<hash8>.<ext>
 *
 * Pending images are uploaded when the user calls analyzeMeal; they get
 * promoted to committed when they commitMeal. Orphans in pending/ can be
 * swept by a GC job.
 *
 * Note: save() and promote() are now async (they make network calls). The
 * controller must await them. remove() is fire-and-forget async.
 */

function extFromMime(mime) {
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return "";
}

function shortHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 12);
}

function pendingKey({ userId, timestamp, hash, mimeType }) {
  return `meals/pending/${userId}/${timestamp}-${hash}${extFromMime(mimeType)}`;
}

function committedKeyFor(pending) {
  // "meals/pending/<uid>/<name>" -> "meals/committed/<uid>/<name>"
  return pending.replace("/pending/", "/committed/");
}

/**
 * Upload a meal image buffer to pending/. Returns the R2 key.
 * The key shape matches meals/pending/<userId>/<timestamp>-<hash8>.<ext>.
 *
 * Takes optional `userId` so orphans can be attributed. Falls back to
 * "anon" if the caller didn't thread it through.
 */
async function save(buffer, mimeType, userId = "anon") {
  const key = pendingKey({
    userId,
    timestamp: Date.now(),
    hash: shortHash(buffer),
    mimeType,
  });
  await storage.uploadBuffer(key, buffer, mimeType);
  return key;
}

/**
 * Move a pending key to committed. R2 doesn't have a rename, so we
 * CopyObject then DeleteObject. Returns the new committed key.
 *
 * Throws if the source object doesn't exist (mirrors the old fs.renameSync
 * ENOENT behavior).
 */
async function promote(key) {
  if (!key || !key.includes("/pending/")) {
    throw new Error(`promote() expected a pending/ key, got: ${key}`);
  }
  const client = _rawClient();
  const bucket = process.env.R2_BUCKET;
  const newKey = committedKeyFor(key);

  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${encodeURIComponent(key)}`,
      Key: newKey,
    })
  );
  // Best-effort cleanup of the pending copy. If this fails the GC will
  // catch it later — don't block the commit.
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    console.warn(`[mealStorage] Failed to delete pending ${key}: ${err.message}`);
  }
  return newKey;
}

/** Non-throwing async delete. */
async function remove(key) {
  if (!key) return;
  try {
    await storage.deleteObject(key);
  } catch (err) {
    console.warn(`[mealStorage] Failed to remove ${key}: ${err.message}`);
  }
}

/**
 * Legacy shim — callers use this to check "does the pending file exist?".
 * We answer yes iff the R2 object exists. Returns a promise that resolves
 * to a truthy value when the object is present.
 *
 * Kept named pathFor to minimise churn at call sites; the old meaning (a
 * filesystem path) no longer applies.
 */
async function pathFor(key) {
  if (!key) return null;
  const exists = await storage.keyExists(key);
  return exists ? key : null;
}

/** Public URL for a stored image. Null if public access isn't configured. */
function publicUrlFor(key) {
  return storage.getPublicUrl(key);
}

/** Short-lived signed URL for private access. */
async function signedUrlFor(key, expiresIn = 3600) {
  if (!key) return null;
  return storage.getSignedUrl(key, expiresIn);
}

// Internal: builds a raw S3 client for operations not covered by services/storage.
// We can't reach into that module's cached client, so we mirror its config.
function _rawClient() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 storage is not configured (check .env)");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

module.exports = {
  save,
  promote,
  remove,
  pathFor,
  publicUrlFor,
  signedUrlFor,
};
