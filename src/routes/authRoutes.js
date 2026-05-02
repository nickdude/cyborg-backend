const express = require("express");
const router = express.Router();
const { rateLimit } = require("express-rate-limit");
const authController = require("../controllers/authController");
const { validateAuthRequest } = require("../middlewares/validateRequest");

const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Too many attempts. Try again in 5 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many requests. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Register
router.post("/register", authLimiter, validateAuthRequest, authController.register);

// Verify OTP
router.post("/verify-otp", otpLimiter, authController.verifyOTP);

// Login
router.post("/login", authLimiter, authController.login);

// Verify Login OTP
router.post("/verify-login-otp", otpLimiter, authController.verifyLoginOTP);

// Forgot Password
router.post("/forgot-password", authLimiter, authController.forgotPassword);

// Reset Password
router.post("/reset-password", authLimiter, authController.resetPassword);

// Resend OTP
router.post("/resend-otp", otpLimiter, authController.resendOTP);

// Social Login
router.post("/social-login", authLimiter, authController.socialLogin);

module.exports = router;
