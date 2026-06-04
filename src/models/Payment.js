const mongoose = require("mongoose");
const { PAYMENT_STATUSES } = require("../utils/orderStatus");

/**
 * Payment transaction linked to an Order. Gateway-agnostic: `gateway` records
 * which adapter handled it (razorpay now, stripe later), `gatewayOrderId` /
 * `transactionId` hold the provider references.
 */
const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true }, // paise
    currency: { type: String, default: "INR" },
    gateway: { type: String, default: "razorpay" },
    paymentMethod: { type: String, default: "" }, // card/upi/etc (from gateway)
    gatewayOrderId: { type: String, default: null }, // e.g. razorpay order id
    transactionId: { type: String, default: null }, // e.g. razorpay payment id
    signature: { type: String, default: null },
    status: { type: String, enum: PAYMENT_STATUSES, default: "pending" },
    attempts: { type: Number, default: 0 },
    failureReason: { type: String, default: "" },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

paymentSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model("Payment", paymentSchema);
