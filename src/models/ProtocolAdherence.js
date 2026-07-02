const mongoose = require("mongoose");

// One document per user per day, holding the set of protocol items they've marked
// as "taken today". Keyed by productName (the deduplicated-protocol item key).
const protocolAdherenceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true }, // "YYYY-MM-DD" in the user's local time
    taken: { type: [String], default: [] },
  },
  { timestamps: true }
);

protocolAdherenceSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("ProtocolAdherence", protocolAdherenceSchema);
