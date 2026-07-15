const mongoose = require("mongoose");

/**
 * A searchable food/recipe with per-100g nutrition and common serving sizes.
 * Seeded from open datasets (INDB Indian recipes, IFCT 2017 basic foods) via
 * scripts/seedFoodItems.js; `custom` rows can be added by hand later.
 */
const servingSchema = new mongoose.Schema(
  {
    label: { type: String, required: true }, // "1 bowl"
    unit: { type: String, required: true }, // "bowl"
    grams: { type: Number, required: true },
  },
  { _id: false }
);

const per100gSchema = new mongoose.Schema(
  {
    calories: { type: Number, default: 0 },
    proteinG: { type: Number, default: 0 },
    carbsG: { type: Number, default: 0 },
    fatG: { type: Number, default: 0 },
    fiberG: { type: Number, default: 0 },
    sugarG: { type: Number, default: 0 },
  },
  { _id: false }
);

const foodItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // display name, e.g. "Palak Paneer"
    nameNorm: { type: String, required: true }, // lowercased/trimmed, exact-prefix ranking
    // Lowercased words of name + aliases. The multikey index on this array is
    // what makes ^prefix regex autocomplete fast ($text can't prefix-match).
    searchTokens: { type: [String], default: [] },
    aliases: { type: [String], default: [] }, // regional names ("Kela", "Chapati")
    source: {
      type: String,
      enum: ["indb", "ifct", "usda", "off", "custom"],
      required: true,
    },
    sourceId: { type: String, required: true },
    kind: { type: String, enum: ["food", "recipe"], default: "food" },
    foodGroup: { type: String, default: null },
    per100g: { type: per100gSchema, default: () => ({}) },
    servings: { type: [servingSchema], default: [] },
    defaultServingIdx: { type: Number, default: 0 },
    popularity: { type: Number, default: 0 }, // future ranking lever
  },
  { timestamps: true, collection: "food_items" }
);

foodItemSchema.index({ source: 1, sourceId: 1 }, { unique: true }); // idempotent re-seed
foodItemSchema.index({ searchTokens: 1 });
foodItemSchema.index({ name: "text", aliases: "text" });

module.exports = mongoose.model("FoodItem", foodItemSchema);
