// Global error handling middleware

const { errorResponse } = require("./responseHandler");

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  const errors = err.errors || null;

  // Handle Multer errors (file upload)
  if (err.name === "MulterError") {
    statusCode = 400;
    if (err.code === "FILE_TOO_LARGE") {
      message = "File too large. Maximum file size is 10MB";
    } else if (err.code === "LIMIT_FILE_COUNT") {
      message = "Too many files. Only one file is allowed";
    } else if (err.code === "LIMIT_FILE_SIZE") {
      message = "File size exceeds the maximum limit of 10MB";
    } else {
      message = err.message;
    }
  }

  // Handle custom multer file filter errors
  if (err.message && err.message.includes("Only PDF and image files")) {
    statusCode = 400;
    message = err.message;
  }

  // Handle CORS errors
  if (err.message === "Not allowed by CORS") {
    statusCode = 403;
    message = "Cross-Origin request not allowed";
  }

  console.error("[ERROR]:", {
    message,
    statusCode,
    stack: err.stack,
    url: req.url,
    method: req.method,
    name: err.name,
  });

  res.status(statusCode).json(errorResponse(message, statusCode, errors));
};

module.exports = errorHandler;
