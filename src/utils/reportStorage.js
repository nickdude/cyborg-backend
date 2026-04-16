const fs = require("fs");
const path = require("path");

// Local-disk storage for uploaded reports. Kept behind a small interface so
// the internals can be swapped for S3/R2 later without touching the
// controllers — saveReport / pathFor / deleteReport are the only surface.
const BASE_DIR = process.env.REPORT_STORAGE_DIR || path.join("uploads", "stored-reports");

function extFromMime(mime) {
  if (!mime) return "";
  if (mime === "application/pdf") return ".pdf";
  if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return "";
}

function saveReport(buffer, reportId, mimeType) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  const storageKey = `${reportId}${extFromMime(mimeType)}`;
  fs.writeFileSync(path.join(BASE_DIR, storageKey), buffer);
  return storageKey;
}

function pathFor(storageKey) {
  if (!storageKey) return null;
  return path.join(BASE_DIR, storageKey);
}

function deleteReport(storageKey) {
  if (!storageKey) return;
  try { fs.unlinkSync(path.join(BASE_DIR, storageKey)); } catch (_) {}
}

module.exports = { saveReport, pathFor, deleteReport, BASE_DIR };
