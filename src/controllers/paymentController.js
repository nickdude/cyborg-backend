const Razorpay = require("razorpay");
const crypto = require("crypto");
const User = require("../models/User");
const Subscription = require("../models/Subscription");

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ============== GET ALL PLANS ==============

/**
 * Get all available membership plans
 */
const getAllPlans = async (req, res, next) => {
  try {
    const plans = [
      {
        id: "basic",
        name: "Cyborg Membership",
        amount: 19900,
        price: 199,
        currency: "INR",
        description: "100+ health tests, tracked over time and a private medical team.",
        features: [
          "100+ health tests",
          "Tracked over time",
          "Private medical team",
          "Email support",
        ],
        highlighted: false,
      },
      {
        id: "premium",
        name: "Premium Membership",
        amount: 29900,
        price: 299,
        currency: "INR",
        description: "Everything in Cyborg Membership + Priority support.",
        features: [
          "Everything in Cyborg",
          "Priority support",
          "Dedicated doctor",
          "24/7 chat access",
        ],
        highlighted: true,
      },
      {
        id: "membership",
        name: "Cyborg Membership",
        amount: 19900,
        price: 199,
        currency: "INR",
        description: "1 flat rate purchase to book your photographer.",
        features: [
          "100+ lab tests",
          "Results tracked over time",
          "Private medical team",
          "Email support",
        ],
        highlighted: false,
      },
    ];

    res.sendSuccess(plans, "Plans retrieved successfully");
  } catch (error) {
    next(error);
  }
};

// ============== CREATE ORDER ==============

/**
 * Create a Razorpay order for membership purchase
 */
const createOrder = async (req, res, next) => {
  try {
    const { userId, planType } = req.body;

    // Validate plan type
    const plans = {
      basic: {
        name: "Cyborg Membership",
        amount: 19900, // $199 in paise
        description: "100+ health tests, tracked over time and a private medical team.",
      },
      premium: {
        name: "Premium Membership",
        amount: 29900, // $299 in paise
        description: "Everything in Cyborg Membership + Priority support.",
      },
      membership: {
        name: "Cyborg Membership",
        amount: 19900, // ₹199 in paise
        description: "1 flat rate purchase to book your photographer.",
      },
    };

    if (!plans[planType]) {
      return res.sendError("Invalid plan type", 400);
    }

    const plan = plans[planType];

    // Create Razorpay order
    const orderOptions = {
      amount: plan.amount, // Amount in paise
      currency: "INR",
      receipt: `${userId}-${Date.now()}`,
      notes: {
        userId,
        planType,
      },
    };

    const order = await razorpay.orders.create(orderOptions);

    res.sendSuccess(
      {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: process.env.RAZORPAY_KEY_ID,
        planName: plan.name,
        planType,
      },
      "Order created successfully",
      201
    );
  } catch (error) {
    next(error);
  }
};

// ============== VERIFY PAYMENT ==============

/**
 * Verify payment signature and create subscription
 */
const verifyPayment = async (req, res, next) => {
  try {
    const { userId, orderId, paymentId, signature, planType } = req.body;

    // Verify signature
    const shasum = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    shasum.update(`${orderId}|${paymentId}`);
    const digest = shasum.digest("hex");

    if (digest !== signature) {
      return res.sendError("Payment verification failed", 400);
    }

    // Get payment details from Razorpay
    const payment = await razorpay.payments.fetch(paymentId);

    if (!payment || payment.status !== "captured") {
      return res.sendError("Payment not captured", 400);
    }

    // Get plan details
    const plans = {
      basic: {
        name: "Cyborg Membership",
        amount: 19900,
      },
      premium: {
        name: "Premium Membership",
        amount: 29900,
      },
      membership: {
        name: "Cyborg Membership",
        amount: 19900,
      },
    };

    const plan = plans[planType];
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 1 year subscription

    // Create subscription record
    const subscription = new Subscription({
      userId,
      planType,
      planName: plan.name,
      amount: plan.amount,
      status: "active",
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
      expiryDate,
      autoRenew: true,
    });

    await subscription.save();

    // Update user subscription status (optional)
    const user = await User.findByIdAndUpdate(
      userId,
      { subscriptionStatus: "active" },
      { new: true }
    );

    res.sendSuccess(
      {
        subscription: {
          id: subscription._id,
          planType,
          planName: plan.name,
          status: "active",
          expiryDate,
        },
        paymentId,
      },
      "Payment verified and subscription created",
      201
    );
  } catch (error) {
    next(error);
  }
};

// ============== GET USER SUBSCRIPTION ==============

/**
 * Get current subscription of user
 */
const getUserSubscription = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const subscription = await Subscription.findOne({
      userId,
      status: { $in: ["active", "pending"] },
    }).sort({ createdAt: -1 });

    if (!subscription) {
      return res.sendSuccess(null, "No active subscription found");
    }

    res.sendSuccess(subscription, "Subscription found");
  } catch (error) {
    next(error);
  }
};

// ============== WEBHOOK FOR RAZORPAY ==============

/**
 * Handle Razorpay webhook events
 */
const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.get("X-Razorpay-Signature");
    const body = JSON.stringify(req.body);

    // Verify webhook signature
    const shasum = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET);
    shasum.update(body);
    const digest = shasum.digest("hex");

    if (digest !== signature) {
      return res.status(400).send("Invalid signature");
    }

    const event = req.body.event;
    const eventData = req.body.payload.payment.entity;

    if (event === "payment.authorized" || event === "payment.captured") {
      // Handle payment success
      console.log(`Payment ${eventData.id} captured`);
    } else if (event === "payment.failed") {
      // Handle payment failure
      console.log(`Payment ${eventData.id} failed`);
      // You can update subscription status to 'failed' if needed
    }

    res.sendSuccess(null, "Webhook received");
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllPlans,
  createOrder,
  verifyPayment,
  getUserSubscription,
  handleWebhook,
};
