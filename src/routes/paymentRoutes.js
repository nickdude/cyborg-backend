const express = require("express");
const { verifyToken } = require("../middlewares/authMiddleware");
const {
  getAllPlans,
  createOrder,
  verifyPayment,
  getUserSubscription,
  handleWebhook,
} = require("../controllers/paymentController");

const router = express.Router();

// Get all plans
router.get("/plans", getAllPlans);

// Create Razorpay order
router.post("/create-order", verifyToken, createOrder);

// Verify payment and create subscription
router.post("/verify-payment", verifyToken, verifyPayment);

// Get user's current subscription
router.get("/:userId/subscription", getUserSubscription);

// Razorpay webhook (no auth needed)
router.post("/webhook", handleWebhook);

module.exports = router;
