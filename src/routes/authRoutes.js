const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { validateAuthRequest } = require("../middlewares/validateRequest");

// Register
router.post("/register", validateAuthRequest, authController.register);

// Verify OTP
router.post("/verify-otp", authController.verifyOTP);

// Login
router.post("/login", authController.login);

// Verify Login OTP
router.post("/verify-login-otp", authController.verifyLoginOTP);

// Forgot Password
router.post("/forgot-password", authController.forgotPassword);

// Reset Password
router.post("/reset-password", authController.resetPassword);

// Resend OTP
router.post("/resend-otp", authController.resendOTP);

// Social Login
router.post("/social-login", authController.socialLogin);

module.exports = router;
