const mongoose = require("mongoose");

const glucoseReadingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    timestamp: { type: Date, required: true },
    valueMgDl: { type: Number, required: true },
    source: {
      type: String,
      enum: ["predicted", "manual"],
      default: "predicted",
    },
    mealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meal",
      default: null,
    },
    tags: { type: [String], default: [] },
  },
  { timestamps: true, collection: "glucose_readings" }
);

glucoseReadingSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model("GlucoseReading", glucoseReadingSchema);
