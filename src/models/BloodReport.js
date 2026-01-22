const mongoose = require("mongoose");

const bloodReportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    fileSize: Number,
    mimeType: String,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    actionPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActionPlan",
    },
    // AI-generated action plan
    actionPlan: {
      type: String, // Will store the AI-generated action plan
    },
    actionPlanGeneratedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("BloodReport", bloodReportSchema);
