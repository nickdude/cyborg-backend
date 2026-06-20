// Industry-standard response handler middleware

const successResponse = (data = null, message = "Success", statusCode = 200) => {
  return {
    success: true,
    statusCode,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
};

const errorResponse = (message = "Error", statusCode = 500, errors = null) => {
  return {
    success: false,
    statusCode,
    message,
    errors,
    timestamp: new Date().toISOString(),
  };
};

// Middleware to attach response handlers to res object
const responseHandler = (req, res, next) => {
  res.sendSuccess = (data, message = "Success", statusCode = 200) => {
    res.status(statusCode).json(successResponse(data, message, statusCode));
  };

  res.sendError = (message = "Error", statusCode = 500, errors = null) => {
    res.status(statusCode).json(errorResponse(message, statusCode, errors));
  };

  next();
};

module.exports = { responseHandler, successResponse, errorResponse };
