const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    planType: {
      type: String,
      enum: ["advanced", "auto-pilot", "baseline"],
      required: true,
    },
    planName: String,
    amount: Number, // in paise
    durationMonths: Number, // length of the subscription term in months
    currency: {
      type: String,
      default: "INR",
    },
    status: {
      type: String,
      enum: ["pending", "active", "expired", "cancelled"],
      default: "active",
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    expiryDate: Date,
    autoRenew: {
      type: Boolean,
      default: true,
    },
    transactionNotes: String,
    // Free (baseline) plan only: daily AI-Concierge usage counter. Paid plans are
    // unlimited so this stays untouched for them. `date` is a YYYY-MM-DD key so the
    // count auto-resets each day.
    conciergeDaily: {
      date: { type: String, default: null },
      count: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// Index for quick user lookups
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ status: 1 });

module.exports = mongoose.model("Subscription", subscriptionSchema);
