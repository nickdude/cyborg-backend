const multer = require("multer");
const path = require("path");

// Blood report uploads use memoryStorage so the buffer reaches the
// controller directly (req.file.buffer). From there the controller hashes
// it for dedupe, uploads to R2, and hands the same buffer to Claude Vision
// — no round-trip through disk.
const ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/webp",
];
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIMES.includes(file.mimetype) && ALLOWED_EXTENSIONS.includes(ext)) {
    console.log(
      "[MULTER] accept",
      JSON.stringify({ originalname: file.originalname, mimetype: file.mimetype, ext })
    );
    return cb(null, true);
  }
  // Common mobile cause: iPhone HEIC/HEIF photos arrive as image/heic or
  // application/octet-stream and get rejected here.
  console.warn(
    "[MULTER] reject",
    JSON.stringify({
      originalname: file.originalname,
      mimetype: file.mimetype,
      ext,
      reason: "mimetype/extension not in allowlist",
    })
  );
  const err = new Error("Only PDF and image files (JPG, PNG, WEBP) are allowed");
  err.statusCode = 400;
  cb(err, false);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
  },
});

module.exports = upload;
