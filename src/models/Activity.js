const mongoose = require("mongoose");

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
  },
  { timestamps: true, collection: "activities" }
);

activitySchema.index({ userId: 1, startTime: -1 });

module.exports = mongoose.model("Activity", activitySchema);
