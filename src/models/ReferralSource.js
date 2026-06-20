const mongoose = require("mongoose");

const referralSourceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    socialMediaOrAd: {
      platforms: [{ type: String, enum: ["TikTok", "Instagram", "Facebook", "YouTube", "LinkedIn", "Other"] }],
      otherText: { type: String },
    },

    wordOfMouth: {
      sources: [{ type: String, enum: ["Friend", "Family", "Colleague", "Clinician", "Other"] }],
      otherText: { type: String },
    },

    podcast: { note: { type: String } },
    creator: { note: { type: String } },

    webSearch: {
      engines: [{ type: String, enum: ["Google", "Bing", "ChatGPT", "Perplexity", "Claude", "Other"] }],
      otherText: { type: String },
    },

    email: {
      sources: [{ type: String, enum: ["Newsletter", "Superpower Journal", "Other"] }],
      otherText: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ReferralSource", referralSourceSchema);
