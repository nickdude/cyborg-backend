const mongoose = require("mongoose");

const questionnaireSchema = new mongoose.Schema(
  {
    questionary: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Questionnaire", questionnaireSchema);
