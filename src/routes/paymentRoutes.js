const express = require("express");
const { verifyToken, checkOwnership } = require("../middlewares/authMiddleware");
const {
  getAllPlans,
  createOrder,
  verifyPayment,
  getUserSubscription,
  handleWebhook,
  activateFreePlan,
} = require("../controllers/paymentController");

const router = express.Router();

// Get all plans
router.get("/plans", getAllPlans);

// Create Razorpay order
router.post("/create-order", verifyToken, createOrder);

// Verify payment and create subscription
router.post("/verify-payment", verifyToken, verifyPayment);

// Activate a free plan (no Razorpay) — e.g. AMINO9 Baseline
router.post("/activate-free", verifyToken, activateFreePlan);

// Get user's current subscription — auth + ownership (self, or the patient's
// linked doctor). Previously public, leaking any user's plan + Razorpay ids.
router.get("/:userId/subscription", verifyToken, checkOwnership, getUserSubscription);

// Razorpay webhook (no auth needed)
router.post("/webhook", handleWebhook);

module.exports = router;
