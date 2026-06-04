const mongoose = require("mongoose");

/**
 * Append-only history of subscription lifecycle events (purchased / renewed /
 * expired / cancelled). Powers the "Plans Purchased" view in purchase history
 * and keeps a record even after a Subscription document changes.
 */
const subscriptionHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
    planType: String,
    planName: String,
    amount: Number, // paise
    currency: { type: String, default: "INR" },
    action: {
      type: String,
      enum: ["purchased", "renewed", "expired", "cancelled", "refunded"],
      required: true,
    },
    startDate: Date,
    endDate: Date,
  },
  { timestamps: true }
);

subscriptionHistorySchema.index({ userId: 1, createdAt: -1 });

subscriptionHistorySchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model("SubscriptionHistory", subscriptionHistorySchema);
