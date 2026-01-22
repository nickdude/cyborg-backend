const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Create uploads directory if not exists
const uploadsDir = path.join(__dirname, "../../uploads/blood-reports");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/jpg",
  ];
  const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png"];

  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedMimes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF and image files (JPG, PNG) are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

module.exports = upload;
