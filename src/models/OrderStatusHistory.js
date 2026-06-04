const mongoose = require("mongoose");
const { ORDER_STATUSES } = require("../utils/orderStatus");

// Append-only audit trail of an order's lifecycle transitions.
const orderStatusHistorySchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    status: { type: String, enum: ORDER_STATUSES, required: true },
    note: { type: String, default: "" },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // null = system
  },
  { timestamps: true }
);

orderStatusHistorySchema.index({ orderId: 1, createdAt: 1 });

orderStatusHistorySchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model("OrderStatusHistory", orderStatusHistorySchema);
