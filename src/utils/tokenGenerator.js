// OTP and token generation utilities

const crypto = require("crypto");

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Generate reset token
const generateResetToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// Calculate OTP expiry (5 minutes from now)
const getOTPExpiry = () => {
  return new Date(Date.now() + 5 * 60 * 1000);
};

// Calculate reset token expiry (1 hour from now)
const getResetTokenExpiry = () => {
  return new Date(Date.now() + 60 * 60 * 1000);
};

module.exports = {
  generateOTP,
  generateResetToken,
  getOTPExpiry,
  getResetTokenExpiry,
};
