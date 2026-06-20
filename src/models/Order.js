const mongoose = require("mongoose");
const { ORDER_STATUSES, PAYMENT_STATUSES } = require("../utils/orderStatus");

// Order line item (embedded). Snapshots name/price at purchase time so the
// order is immutable even if the catalog product later changes or is removed.
const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: { type: String, required: true },
    image: { type: String, default: "" },
    type: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true }, // paise
    totalPrice: { type: Number, required: true }, // paise (unitPrice * quantity)
  },
  { _id: false }
);

// Address snapshot embedded on the order (so the delivery address is preserved
// even if the user later edits/deletes the saved Address).
const addressSnapshotSchema = new mongoose.Schema(
  {
    fullName: String,
    phoneNumber: String,
    addressLine1: String,
    addressLine2: String,
    landmark: String,
    city: String,
    state: String,
    country: String,
    pincode: String,
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    addressId: { type: mongoose.Schema.Types.ObjectId, ref: "Address" },
    shippingAddress: addressSnapshotSchema,

    items: { type: [orderItemSchema], default: [] },

    // Pricing breakdown (all paise)
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    currency: { type: String, default: "INR" },

    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: "pending" },
    orderStatus: { type: String, enum: ORDER_STATUSES, default: "Pending" },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1 });

orderSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model("Order", orderSchema);
