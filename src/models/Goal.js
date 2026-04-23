const mongoose = require("mongoose");

const biomarkerEvidenceSchema = new mongoose.Schema(
  {
    name: { type: String },
    canonicalName: { type: String },
    flag: { type: String },
    value: { type: Number },
    unit: { type: String },
    referenceMin: { type: Number, default: null },
    referenceMax: { type: Number, default: null },
    optimalMin: { type: Number, default: null },
    optimalMax: { type: Number, default: null },
  },
  { _id: false }
);

const recommendedActionSchema = new mongoose.Schema(
  {
    number: { type: Number },
    label: { type: String },
    detail: { type: String },
  },
  { _id: false }
);

const protocolItemSchema = new mongoose.Schema(
  {
    productName: { type: String },
    dosing: { type: String },
    triggerBiomarkers: [{ type: String }],
  },
  { _id: false }
);

const deltaSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["new", "improved", "worsened", "unchanged", "resolved"],
      default: "new",
    },
    previousPriority: { type: String, default: null },
    improvedBiomarkers: [{ type: String }],
    worsenedBiomarkers: [{ type: String }],
  },
  { _id: false }
);

const goalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReportData",
      required: true,
      index: true,
    },
    goalId: { type: String, required: true },
    title: { type: String, required: true },
    priority: {
      type: String,
      enum: ["High", "Medium", "Low"],
      default: "Medium",
    },
    healthImpact: { type: String, default: "" },
    category: { type: String, default: "" },
    recoveryTimeWeeks: [{ type: Number }],

    description: { type: String, default: "" },
    whatThisMeans: { type: String, default: "" },
    potentialCauses: { type: String, default: "" },
    recommendedActions: [recommendedActionSchema],

    biomarkerEvidence: [biomarkerEvidenceSchema],
    protocolItems: [protocolItemSchema],
    delta: { type: deltaSchema, default: () => ({ status: "new" }) },
  },
  { timestamps: true }
);

goalSchema.index({ userId: 1, reportId: 1 });
goalSchema.index({ userId: 1, createdAt: -1 });
goalSchema.index({ reportId: 1, goalId: 1 }, { unique: true });

module.exports = mongoose.model("Goal", goalSchema);
