const mongoose = require("mongoose");

// AI post-workout recovery analysis (see prompts/postWorkoutAnalysis.js —
// the prompt's JSON schema is the source of truth for these field names).
// Cached on the activity after first generation so repeat opens of the
// recovery sheet don't re-bill the LLM.
const recoveryFoodSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    description: { type: String, default: "" },
    macros: {
      calories: { type: Number, default: null },
      proteinG: { type: Number, default: null },
      carbsG: { type: Number, default: null },
      fatG: { type: Number, default: null },
      fiberG: { type: Number, default: null },
      sugarG: { type: Number, default: null },
    },
    dietTags: { type: [String], default: [] },
    rationale: { type: String, default: "" },
  },
  { _id: false }
);

const recoveryAnalysisSchema = new mongoose.Schema(
  {
    foodRecommendations: { type: [recoveryFoodSchema], default: [] },
    insights: { type: [String], default: [] },
    recommendations: { type: [String], default: [] },
    generatedAt: { type: Date, required: true },
  },
  { _id: false }
);

const activitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    category: {
      type: String,
      enum: [
        "cardio",
        "strength",
        "flexibility",
        "sports",
        "water",
        "mind_body",
        "outdoor",
        "other",
      ],
      default: "other",
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationMinutes: { type: Number, required: true },
    caloriesBurned: { type: Number, default: null },
    notes: { type: String, default: null },
    source: {
      type: String,
      enum: ["manual", "apple_watch", "garmin", "fitbit", "whoop", "oura"],
      default: "manual",
    },
    recoveryAnalysis: { type: recoveryAnalysisSchema, default: null },
  },
  { timestamps: true, collection: "activities" }
);

activitySchema.index({ userId: 1, startTime: -1 });

module.exports = mongoose.model("Activity", activitySchema);
