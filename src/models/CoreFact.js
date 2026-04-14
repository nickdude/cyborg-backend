const mongoose = require("mongoose");
const { getVectorDb } = require("../config/vectorDb");

const coreFactSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  fact: { type: String, required: true, maxlength: 200 },
  category: {
    type: String,
    enum: ['allergy', 'medication', 'goal', 'preference', 'health_flag', 'condition'],
    required: true,
  },
  importance: {
    type: String,
    enum: ['critical', 'high', 'medium'],
    default: 'medium',
  },
}, { timestamps: true });

coreFactSchema.index({ userId: 1, importance: 1 });

// Lazy model — getVectorDb() is NOT called at import time.
// It's called on first use, after dotenv has loaded.
let _model = null;
function getModel() {
  if (!_model) _model = getVectorDb().model('CoreFact', coreFactSchema);
  return _model;
}

const CoreFact = new Proxy({}, {
  get(_, prop) {
    const m = getModel();
    const val = m[prop];
    return typeof val === 'function' ? val.bind(m) : val;
  },
});

module.exports = CoreFact;
