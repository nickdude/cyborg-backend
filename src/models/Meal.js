const mongoose = require("mongoose");

const portionSchema = new mongoose.Schema(
  {
    quantity: { type: Number, default: null },
    unit: { type: String, default: null },
    grams: { type: Number, default: null },
  },
  { _id: false }
);

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    // Lowercased/trimmed name — kept in sync by the hooks below so
    // cross-user ingredient aggregations can use an indexed exact match
    // instead of an unindexable case-insensitive regex scan.
    nameNorm: { type: String, default: null },
    portion: { type: portionSchema, default: () => ({}) },
    calories: { type: Number, default: 0 },
    proteinG: { type: Number, default: 0 },
    carbsG: { type: Number, default: 0 },
    fatG: { type: Number, default: 0 },
    fiberG: { type: Number, default: 0 },
    sugarG: { type: Number, default: 0 },
  },
  { _id: false }
);

const totalsSchema = new mongoose.Schema(
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

const mealSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, default: "" },
    consumedAt: { type: Date, required: true },
    mealType: {
      type: String,
      enum: ["breakfast", "lunch", "dinner", "snack", null],
      default: null,
    },
    totals: { type: totalsSchema, default: () => ({}) },
    items: { type: [itemSchema], default: [] },
    imageKeys: { type: [String], default: [] },
    inputText: { type: String, default: null },
    confidence: {
      type: String,
      enum: ["low", "medium", "high", null],
      default: null,
    },
    modelUsed: { type: String, default: "" },
    tokensUsed: {
      input: { type: Number, default: 0 },
      output: { type: Number, default: 0 },
    },
  },
  { timestamps: true, collection: "meals" }
);

mealSchema.index({ userId: 1, consumedAt: -1 });
mealSchema.index({ "items.nameNorm": 1 });

const normName = (s) => String(s || "").toLowerCase().trim();

// Keep items.nameNorm in sync on both write paths: document saves
// (create/save) and findOneAndUpdate $set patches.
mealSchema.pre("validate", function (next) {
  for (const it of this.items || []) {
    it.nameNorm = normName(it.name);
  }
  next();
});

mealSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  const items = update.$set?.items ?? update.items;
  if (Array.isArray(items)) {
    for (const it of items) {
      if (it && typeof it === "object") it.nameNorm = normName(it.name);
    }
  }
  next();
});

module.exports = mongoose.model("Meal", mealSchema);
