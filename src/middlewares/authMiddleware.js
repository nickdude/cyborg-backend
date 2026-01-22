// Authentication middleware

const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  try {
    const token =
      req.headers.authorization && req.headers.authorization.split(" ")[1];

    if (!token) {
      return res.sendError("Access token is required", 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_secret_key");
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Token verification failed:", error.message);
    return res.sendError("Invalid or expired token", 401);
  }
};

// Check user role
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.sendError("User not authenticated", 401);
    }

    if (!allowedRoles.includes(req.user.userType)) {
      return res.sendError("Insufficient permissions", 403);
    }

    next();
  };
};

module.exports = { verifyToken, checkRole };
