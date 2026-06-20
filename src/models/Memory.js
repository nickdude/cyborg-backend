const mongoose = require("mongoose");
const { getVectorDb } = require("../config/vectorDb");

const memorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  content: { type: String, required: true, maxlength: 500 },
  category: {
    type: String,
    enum: ['preference', 'goal', 'health_event', 'lifestyle', 'medication', 'symptom', 'general'],
    required: true,
  },
  tags: { type: [String], default: [] },
  importance: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  source: { type: String, enum: ['ai_detected', 'user_explicit'], default: 'ai_detected' },
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', default: null },
  embedding: { type: [Number], default: null },
  expiresAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Compound indexes for efficient queries
memorySchema.index({ userId: 1, category: 1, isActive: 1 });
memorySchema.index({ userId: 1, tags: 1 });
memorySchema.index({ userId: 1, createdAt: -1 });

// TTL index for auto-expiring memories
memorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $ne: null } } });

// Lowercase tags before save
memorySchema.pre('save', function () {
  if (this.isModified('tags')) {
    this.tags = this.tags.map(t => t.toLowerCase().trim()).filter(Boolean);
  }
});

// Lazy model — getVectorDb() is NOT called at import time.
// It's called on first use, after dotenv has loaded.
let _model = null;
function getModel() {
  if (!_model) _model = getVectorDb().model('Memory', memorySchema);
  return _model;
}

const Memory = new Proxy({}, {
  get(_, prop) {
    const m = getModel();
    const val = m[prop];
    return typeof val === 'function' ? val.bind(m) : val;
  },
});

module.exports = Memory;
