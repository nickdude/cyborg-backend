// Global error handling middleware

const { errorResponse } = require("./responseHandler");

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  const errors = err.errors || null;

  console.error("[ERROR]:", {
    message,
    statusCode,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  res.status(statusCode).json(errorResponse(message, statusCode, errors));
};

module.exports = errorHandler;
