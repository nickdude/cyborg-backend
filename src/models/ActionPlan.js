const mongoose = require("mongoose");

const actionPlanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: "BloodReport", required: true },
    status: {
      type: String,
      enum: ["pending", "ready", "failed"],
      default: "pending",
    },
    planJson: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    readyAt: Date,
    failedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("ActionPlan", actionPlanSchema);
