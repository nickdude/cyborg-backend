const mongoose = require("mongoose");
const { getVectorDb } = require("../config/vectorDb");

const chatSummarySchema = new mongoose.Schema({
  chatId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  // Origin of the chat. Doctor-chat summaries are stored under the doctor's id,
  // never the patient's, so they don't surface in the patient's AI recall.
  chatType: { type: String, enum: ['patient', 'doctor'], default: 'patient' },
  summary: { type: String, required: true, maxlength: 600 },
  keyTopics: { type: [String], default: [] },
  embedding: { type: [Number], default: null },  // 3072 dims — gemini-embedding-001
  messageCount: { type: Number, default: 0 },
  chatDate: { type: Date, default: Date.now },
}, { timestamps: true });

chatSummarySchema.index({ userId: 1, chatDate: -1 });

// Lazy model — getVectorDb() is NOT called at import time.
// It's called on first use, after dotenv has loaded.
let _model = null;
function getModel() {
  if (!_model) _model = getVectorDb().model('ChatSummary', chatSummarySchema);
  return _model;
}

const ChatSummary = new Proxy({}, {
  get(_, prop) {
    const m = getModel();
    const val = m[prop];
    return typeof val === 'function' ? val.bind(m) : val;
  },
});

module.exports = ChatSummary;
