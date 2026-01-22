const mongoose = require("mongoose");

const onboardingAnswerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    answers: {
      type: mongoose.Schema.Types.Mixed, // Flexible structure for various questions
      required: true,
    },
    questionsVersion: {
      type: String,
      default: "1.0",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("OnboardingAnswer", onboardingAnswerSchema);
