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
      message = "File too large. Maximum file size is 20MB";
    } else if (err.code === "LIMIT_FILE_COUNT") {
      message = "Too many files. Only one file is allowed";
    } else if (err.code === "LIMIT_FILE_SIZE") {
      message = "File size exceeds the maximum limit of 20MB";
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

  // Never leak raw LLM output to the client. If an LLM_JSON_PARSE_FAILED
  // (or a legacy "Failed to parse LLM response" message) escapes a controller,
  // sanitize to a friendly 502 and keep the raw detail in server logs only.
  if (
    err.code === "LLM_JSON_PARSE_FAILED" ||
    (typeof err.message === "string" && err.message.startsWith("Failed to parse LLM response"))
  ) {
    console.error("[LLM_PARSE_LEAK]", {
      url: req.url,
      method: req.method,
      code: err.code || null,
      rawLength: err.rawLength ?? null,
      rawSnippet: err.rawSnippet ?? (typeof err.message === "string" ? err.message.slice(0, 500) : null),
    });
    statusCode = 502;
    message = "We couldn't read this report. Please re-upload or try a clearer scan.";
  }

  console.error("[ERROR]:", {
    message,
    statusCode,
    stack: err.stack,
    url: req.url,
    method: req.method,
    name: err.name,
    code: err.code || null,
    origin: req.headers?.origin,
    userAgent: req.headers?.["user-agent"],
  });

  res.status(statusCode).json(errorResponse(message, statusCode, errors));
};

module.exports = errorHandler;
