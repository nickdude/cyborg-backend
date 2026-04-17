const storage = require("../services/storage");

/**
 * Blood-report file storage. Backed by Cloudflare R2.
 *
 * Keys are namespaced per user to keep browsing in the R2 dashboard sane:
 *   blood-reports/<userId>/<sha256>.<ext>
 *
 * Using the file hash as the object name means duplicate uploads from the
 * same user collapse to the same R2 object — matches the dedupe logic in the
 * controller (which short-circuits before ever reaching this module).
 */

function extFromMime(mime) {
  if (!mime) return "";
  if (mime === "application/pdf") return ".pdf";
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return "";
}

function buildKey({ userId, fileHash, mimeType }) {
  if (!userId || !fileHash) {
    throw new Error("buildKey requires userId and fileHash");
  }
  return `blood-reports/${userId}/${fileHash}${extFromMime(mimeType)}`;
}

/**
 * Upload a report buffer to R2. Returns the storage key; callers can derive
 * a public URL via publicUrlFor().
 */
async function saveReport({ userId, fileHash, buffer, mimeType }) {
  const key = buildKey({ userId, fileHash, mimeType });
  await storage.uploadBuffer(key, buffer, mimeType);
  return key;
}

/** Public URL for a stored report. Null if public access isn't configured. */
function publicUrlFor(storageKey) {
  return storage.getPublicUrl(storageKey);
}

/** Short-lived signed URL for private access. */
async function signedUrlFor(storageKey, expiresIn = 3600) {
  if (!storageKey) return null;
  return storage.getSignedUrl(storageKey, expiresIn);
}

/** Best-effort delete — swallows errors so caller flow isn't blocked. */
async function deleteReport(storageKey) {
  if (!storageKey) return;
  try {
    await storage.deleteObject(storageKey);
  } catch (err) {
    console.warn(`[reportStorage] Failed to delete ${storageKey}: ${err.message}`);
  }
}

module.exports = {
  saveReport,
  publicUrlFor,
  signedUrlFor,
  deleteReport,
  buildKey,
};
