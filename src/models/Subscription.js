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
      enum: ["basic", "premium", "membership"],
      required: true,
    },
    planName: String,
    amount: Number, // in paise
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
  },
  {
    timestamps: true,
  }
);

// Index for quick user lookups
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ status: 1 });

module.exports = mongoose.model("Subscription", subscriptionSchema);
