const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Local-disk storage for meal images. Same interface shape as reportStorage —
// swap the internals for an S3/R2 client at deploy time and nothing else
// needs to change. Keys are uuid-prefixed and carry their own path segment
// so the driver doesn't need to remember the prefix layout.
const BASE_DIR = process.env.MEAL_STORAGE_DIR || path.join("uploads", "meal-images");

function extFromMime(mime) {
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return "";
}

function ensureDir(dirAbs) {
  fs.mkdirSync(dirAbs, { recursive: true });
}

/**
 * Write `buffer` to the pending area. Returns an opaque key
 * like "meal-images/pending/<uuid>.jpg".
 */
function save(buffer, mimeType) {
  const pendingDir = path.join(BASE_DIR, "pending");
  ensureDir(pendingDir);
  const name = `${crypto.randomUUID()}${extFromMime(mimeType)}`;
  fs.writeFileSync(path.join(pendingDir, name), buffer);
  return path.join("meal-images", "pending", name);
}

/**
 * Move an image from pending/ to committed/. Returns the new key.
 * Throws if the source file doesn't exist.
 */
function promote(key) {
  if (!key || !key.includes("/pending/")) {
    throw new Error(`promote() expected a pending/ key, got: ${key}`);
  }
  const name = path.basename(key);
  const fromAbs = path.join(BASE_DIR, "pending", name);
  const committedDir = path.join(BASE_DIR, "committed");
  ensureDir(committedDir);
  const toAbs = path.join(committedDir, name);
  fs.renameSync(fromAbs, toAbs);
  return path.join("meal-images", "committed", name);
}

/** Non-throwing delete. */
function remove(key) {
  if (!key) return;
  try {
    fs.unlinkSync(pathFor(key));
  } catch (_) {}
}

/** Resolve a key back to an absolute filesystem path. */
function pathFor(key) {
  if (!key) return null;
  // key looks like "meal-images/pending/xxx.jpg" or "meal-images/committed/xxx.jpg"
  // Strip the leading "meal-images/" since BASE_DIR already ends there.
  const relative = key.startsWith("meal-images/") ? key.slice("meal-images/".length) : key;
  return path.join(BASE_DIR, relative);
}

module.exports = { save, promote, remove, pathFor, BASE_DIR };
