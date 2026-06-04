const mongoose = require("mongoose");

/**
 * Marketplace product — supplements, tests, and prescriptions.
 * A single collection with a `type` discriminator keeps querying/filtering
 * simple and scales to admin-managed catalogs without code changes.
 */
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    brand: { type: String, default: "" },
    description: { type: String, default: "" },
    category: { type: String, default: "" },
    type: {
      type: String,
      enum: ["supplement", "test", "prescription"],
      required: true,
      index: true,
    },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, default: null },
    image: { type: String, default: "" },
    onSale: { type: Boolean, default: false },
    section: { type: String, default: "" },
    // Optional deep-link to a dedicated product page (e.g. semaglutide flow).
    link: { type: String, default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Common query path: by type + active, grouped by section.
productSchema.index({ type: 1, isActive: 1, section: 1 });

// Expose `id` (string) to the frontend instead of `_id`.
productSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model("Product", productSchema);
