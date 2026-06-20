const mongoose = require("mongoose");

// Cart line item (embedded). Only productId + quantity are persisted; pricing
// is always recomputed from the live Product on read so the cart reflects
// current prices and never serves stale amounts.
const cartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one active cart per user
      index: true,
    },
    items: { type: [cartItemSchema], default: [] },
    // Optional applied discount in paise (coupon support hook).
    discount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

cartSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model("Cart", cartSchema);
