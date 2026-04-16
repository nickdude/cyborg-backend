const multer = require("multer");

// Meals accept up to 5 images, 10 MB each, images only.
// Uses memoryStorage so the buffer lands in req.files[].buffer — no temp
// files on disk. This matches how we want mealStorage.save() to receive it.
const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/jpg", "image/webp"];

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIMES.includes(file.mimetype)) {
    return cb(null, true);
  }
  cb(new Error("Only JPG, PNG, and WebP images are supported"), false);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 5,
  },
});

module.exports = upload;
