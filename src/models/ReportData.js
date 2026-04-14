const mongoose = require("mongoose");

const normalizedTestSchema = new mongoose.Schema({
  canonicalName: { type: String, required: true },
  displayName: { type: String },
  category: { type: String },
  numericValue: { type: Number, default: null },
  unit: { type: String },
  referenceMin: { type: Number, default: null },
  referenceMax: { type: Number, default: null },
  optimalMin: { type: Number, default: null },
  optimalMax: { type: Number, default: null },
  flag: { type: String, default: null },
  optimalFlag: { type: String, default: null },
  panelTag: { type: String, default: 'Core Panel' },
  isDerived: { type: Boolean, default: false },
}, { _id: false });

const reportDataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sourceUrl: { type: String, required: true },
  filename: { type: String, default: '' },
  parsedData: { type: mongoose.Schema.Types.Mixed, required: true },
  reportDate: { type: Date, default: null },
  reportLabel: { type: String, default: '' },
  biomarkerPanel: { type: [normalizedTestSchema], default: [] },
  scores: { type: mongoose.Schema.Types.Mixed, default: null },
  modelUsed: { type: String, default: '' },
  tokensUsed: {
    input: { type: Number, default: 0 },
    output: { type: Number, default: 0 },
  },
}, { timestamps: true, collection: 'reportsData' });

reportDataSchema.index({ userId: 1, reportDate: -1 });
reportDataSchema.index({ userId: 1, 'biomarkerPanel.canonicalName': 1, reportDate: -1 });

const ReportData = mongoose.model('ReportData', reportDataSchema);

module.exports = ReportData;
