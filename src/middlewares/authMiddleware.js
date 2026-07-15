// Authentication middleware

const jwt = require("jsonwebtoken");
const User = require("../models/User");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET env var is required");
}

const verifyToken = (req, res, next) => {
  try {
    const token =
      req.headers.authorization && req.headers.authorization.split(" ")[1];

    if (!token) {
      return res.sendError("Access token is required", 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

// Allow access to /:userId resources only for the user themselves, or for a
// doctor who is actually LINKED to that patient. Previously every doctor got a
// blanket pass on any :userId, letting any doctor (incl. a self-registered one)
// read and modify any patient's profile/medical data.
const checkOwnership = async (req, res, next) => {
  try {
    const paramUserId = req.params.userId;
    if (!paramUserId) return next();
    if (String(req.user.id) === String(paramUserId)) return next();

    if (req.user.userType === "doctor") {
      const patient = await User.findById(paramUserId)
        .select("linkedDoctor")
        .lean();
      if (patient && String(patient.linkedDoctor) === String(req.user.id)) {
        return next();
      }
    }
    return res.sendError("Forbidden", 403);
  } catch (err) {
    next(err);
  }
};

module.exports = { verifyToken, checkRole, checkOwnership };
