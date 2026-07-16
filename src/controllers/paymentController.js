require("dotenv").config();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const User = require("../models/User");
const Subscription = require("../models/Subscription");

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ============== PLAN CATALOG (single source of truth) ==============
//
// `price` is in rupees (for display), `amount` is what Razorpay charges in
// paise (amount = price * 100). `durationMonths` is the length of the term the
// purchase grants — used to compute the subscription expiry date.
const PLANS = {
  advanced: {
    id: "advanced",
    name: "Advanced",
    price: 15000,
    amount: 1500000, // ₹15,000 in paise
    currency: "INR",
    billingPeriod: "month",
    durationMonths: 1,
    description:
      "Comprehensive metabolic care — Amino+9, full labs, and a quarterly GLP-1 pen.",
    features: ["Amino+9", "Labs", "1 GLP-1 Pen (Indian) per quarter"],
    highlighted: true,
  },
  "auto-pilot": {
    id: "auto-pilot",
    name: "Auto-Pilot",
    price: 10000,
    amount: 1000000, // ₹10,000 in paise (grants 6-month access)
    currency: "INR",
    billingPeriod: "6 months",
    durationMonths: 6,
    description: "Set-and-forget subscription — 6 months of guided metabolic care.",
    features: ["6-month subscription", "Subscription-based plan"],
    highlighted: false,
  },
  // Free entry tier — AI Concierge access only, no payment (₹0). Activated via
  // the dedicated /activate-free endpoint since Razorpay can't create a ₹0 order.
  baseline: {
    id: "baseline",
    name: "AMINO9 Baseline",
    price: 0,
    amount: 0, // free — no Razorpay charge
    currency: "INR",
    billingPeriod: "month",
    durationMonths: 1,
    description: "Free plan — AI Concierge access for one month.",
    features: ["AI Concierge access (1 month)", "5–6 interactions/day"],
    highlighted: false,
    free: true,
  },
};

const getPlan = (planType) => PLANS[planType] || null;

// ============== GET ALL PLANS ==============

/**
 * Get all available membership plans
 */
const getAllPlans = async (req, res, next) => {
  try {
    res.sendSuccess(Object.values(PLANS), "Plans retrieved successfully");
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
    const { planType, firstName, lastName, email, zip, dob, phone } = req.body;

    // Authorization: act only on the authenticated user. A previous version took
    // userId from the request body and fed it straight into findByIdAndUpdate,
    // letting any logged-in caller overwrite ANY user's PII (IDOR).
    const userId = req.user.id;

    // Validate required fields
    if (!planType) {
      return res.sendError("Plan type is required", 400);
    }

    if (!firstName || !lastName || !email || !zip || !dob || !phone) {
      return res.sendError("All user details are required (firstName, lastName, email, zip, dob, phone)", 400);
    }

    // Update the authenticated user's own details before creating the order.
    await User.findByIdAndUpdate(userId, {
      firstName,
      lastName,
      email,
      phone,
      zipCode: zip,
      dateOfBirth: new Date(dob),
    });

    // Validate plan type against the canonical catalog
    const plan = getPlan(planType);
    if (!plan) {
      return res.sendError("Invalid plan type", 400);
    }

    // Free plans can't create a ₹0 Razorpay order — they go through /activate-free.
    if (plan.amount <= 0) {
      return res.sendError("This is a free plan; use /activate-free", 400);
    }

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
    const { orderId, paymentId, signature } = req.body;
    const userId = req.user.id;

    if (!orderId || !paymentId || !signature) {
      return res.sendError("orderId, paymentId and signature are required", 400);
    }

    // Verify signature
    const shasum = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    shasum.update(`${orderId}|${paymentId}`);
    const digest = shasum.digest("hex");

    if (digest !== signature) {
      return res.sendError("Payment verification failed", 400);
    }

    // Idempotency: one captured Razorpay payment may create at most one
    // subscription. A replayed or double-submitted verify returns the existing
    // record instead of minting a duplicate paid subscription. (Backed by a
    // unique index on razorpayPaymentId to also cover the concurrent-request race.)
    const existing = await Subscription.findOne({ razorpayPaymentId: paymentId });
    if (existing) {
      return res.sendSuccess(
        {
          subscription: {
            id: existing._id,
            planType: existing.planType,
            planName: existing.planName,
            status: existing.status,
            expiryDate: existing.expiryDate,
          },
          paymentId,
        },
        "Payment already verified",
        200
      );
    }

    // Fetch the payment and the order. The plan and the owning user are read from
    // the ORDER we created server-side (its notes), NEVER from the client — that
    // is what stops a caller from paying the cheap plan and claiming the pricey
    // one, or binding someone else's payment to their account.
    const payment = await razorpay.payments.fetch(paymentId);
    if (!payment || payment.status !== "captured") {
      return res.sendError("Payment not captured", 400);
    }
    if (payment.order_id !== orderId) {
      return res.sendError("Payment does not match the order", 400);
    }

    const order = await razorpay.orders.fetch(orderId);
    const planType = order?.notes?.planType;
    const orderUserId = order?.notes?.userId;

    const plan = getPlan(planType);
    if (!plan) {
      return res.sendError("Invalid plan on order", 400);
    }

    // The order must belong to the authenticated user.
    if (String(orderUserId) !== String(userId)) {
      return res.sendError("This order does not belong to you", 403);
    }

    // The captured amount and currency must match the plan's real price.
    if (payment.amount !== plan.amount || payment.currency !== plan.currency) {
      return res.sendError("Paid amount does not match the selected plan", 400);
    }

    // Expiry is driven by the plan term (Advanced = 1 month, Auto-Pilot = 6 months)
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + plan.durationMonths);

    // Create subscription record
    const subscription = new Subscription({
      userId,
      planType,
      planName: plan.name,
      amount: plan.amount,
      durationMonths: plan.durationMonths,
      status: "active",
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
      expiryDate,
      autoRenew: true,
    });

    await subscription.save();

    // Record subscription history + notify (powers unified purchase history).
    try {
      const SubscriptionHistory = require("../models/SubscriptionHistory");
      const { notify, EVENTS } = require("../services/notificationService");
      await SubscriptionHistory.create({
        userId,
        subscriptionId: subscription._id,
        planType,
        planName: plan.name,
        amount: plan.amount,
        action: "purchased",
        startDate: subscription.purchaseDate,
        endDate: expiryDate,
      });
      await notify(userId, EVENTS.SUBSCRIPTION_PURCHASED, {
        subscriptionId: subscription._id,
        planName: plan.name,
      });
    } catch (e) {
      console.error("[subscription] history/notify failed:", e.message);
    }

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

    // Only a genuinely active, non-expired subscription counts. This makes the
    // endpoint the single source of truth for "does the user have an active
    // plan" — expired and cancelled subscriptions return null. If a user has
    // multiple, the most recent active one wins.
    const subscription = await Subscription.findOne({
      userId,
      status: "active",
      expiryDate: { $gt: new Date() },
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

// ============== ACTIVATE FREE PLAN ==============

/**
 * Activate a zero-cost plan (e.g. AMINO9 Baseline) without Razorpay — a free
 * plan can't create a ₹0 order. Creates the active subscription directly,
 * mirroring verifyPayment minus the payment verification.
 */
const activateFreePlan = async (req, res, next) => {
  try {
    const { userId, planType, firstName, lastName, email, zip, dob, phone } = req.body;

    if (!userId || !planType) {
      return res.sendError("User ID and plan type are required", 400);
    }

    const plan = getPlan(planType);
    if (!plan) {
      return res.sendError("Invalid plan type", 400);
    }
    // This endpoint only activates genuinely free plans — never a paid one.
    if (plan.amount > 0) {
      return res.sendError("This plan requires payment", 400);
    }

    // Persist any onboarding details supplied with the form (all optional here).
    const profileUpdate = {};
    if (firstName) profileUpdate.firstName = firstName;
    if (lastName) profileUpdate.lastName = lastName;
    if (email) profileUpdate.email = email;
    if (phone) profileUpdate.phone = phone;
    if (zip) profileUpdate.zipCode = zip;
    if (dob) profileUpdate.dateOfBirth = new Date(dob);
    if (Object.keys(profileUpdate).length) {
      await User.findByIdAndUpdate(userId, profileUpdate);
    }

    // Don't stack a second active subscription if one already exists.
    const existing = await Subscription.findOne({
      userId,
      status: "active",
      expiryDate: { $gt: new Date() },
    }).sort({ createdAt: -1 });
    if (existing) {
      return res.sendSuccess(
        {
          subscription: {
            id: existing._id,
            planType: existing.planType,
            planName: existing.planName,
            status: existing.status,
            expiryDate: existing.expiryDate,
          },
          alreadyActive: true,
        },
        "Active subscription already exists"
      );
    }

    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + plan.durationMonths);

    const subscription = new Subscription({
      userId,
      planType,
      planName: plan.name,
      amount: plan.amount, // 0
      durationMonths: plan.durationMonths,
      status: "active",
      expiryDate,
      autoRenew: false, // free tier doesn't auto-bill
    });
    await subscription.save();

    // Mirror the paid flow: record history + notify (powers purchase history).
    try {
      const SubscriptionHistory = require("../models/SubscriptionHistory");
      const { notify, EVENTS } = require("../services/notificationService");
      await SubscriptionHistory.create({
        userId,
        subscriptionId: subscription._id,
        planType,
        planName: plan.name,
        amount: plan.amount,
        action: "purchased",
        startDate: subscription.purchaseDate,
        endDate: expiryDate,
      });
      await notify(userId, EVENTS.SUBSCRIPTION_PURCHASED, {
        subscriptionId: subscription._id,
        planName: plan.name,
      });
    } catch (e) {
      console.error("[subscription] free-activation history/notify failed:", e.message);
    }

    res.sendSuccess(
      {
        subscription: {
          id: subscription._id,
          planType,
          planName: plan.name,
          status: "active",
          expiryDate,
        },
      },
      "Free plan activated",
      201
    );
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
  activateFreePlan,
};
