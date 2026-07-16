const mongoose = require("mongoose");

const alternativeSchema = new mongoose.Schema(
  {
    name: { type: String },
    description: { type: String },
    type: { type: String, enum: ["alternative", "blunter"] },
    macros: {
      calories: { type: Number, default: 0 },
      proteinG: { type: Number, default: 0 },
      carbsG: { type: Number, default: 0 },
      fatG: { type: Number, default: 0 },
      fiberG: { type: Number, default: 0 },
      sugarG: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const mealScoreSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    mealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meal",
      required: true,
    },
    foodScore: { type: Number, min: 1, max: 10 },
    foodScoreFactors: {
      glycemicLoadScore: { type: Number, default: 0 },
      fiberRatio: { type: Number, default: 0 },
      proteinPresence: { type: Number, default: 0 },
      sugarDensity: { type: Number, default: 0 },
      fatModulation: { type: Number, default: 0 },
      overallGI: {
        type: String,
        enum: ["low", "medium", "high"],
        default: "medium",
      },
    },
    predictedGlucosePeak: {
      deltaMgDl: { type: Number },
      peakMgDl: { type: Number },
      baselineMgDl: { type: Number },
      confidence: {
        type: String,
        enum: ["low", "medium", "high"],
        default: "medium",
      },
    },
    glucoseAnalysis: {
      spiker: { type: String },
      spikerScore: { type: Number },
      alternatives: { type: [alternativeSchema], default: [] },
      explanation: { type: String },
      // Completion marker — lets a spiker-less analysis still count as a
      // cache hit instead of re-running the AI on every request.
      analyzedAt: { type: Date },
    },
    modelUsed: { type: String, default: "" },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "meal_scores" }
);

mealScoreSchema.index({ userId: 1, mealId: 1 }, { unique: true });
mealScoreSchema.index({ userId: 1, computedAt: -1 });
// The insights ingredient aggregation and timeline both join on mealId alone.
mealScoreSchema.index({ mealId: 1 });

module.exports = mongoose.model("MealScore", mealScoreSchema);
