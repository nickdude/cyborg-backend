const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, default: "" },
  toolUses: { type: mongoose.Schema.Types.Mixed, default: [] },
  thinking: { type: mongoose.Schema.Types.Mixed, default: null },
  // thinking is stored as { '-1': 'pre-tool reasoning', '0': 'after tool[0]', ... }
  // or null when no thinking was emitted
}, { _id: false, timestamps: false });

const chatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: 'New Chat' },
  messages: [messageSchema],
  chatType: { type: String, enum: ['patient', 'doctor'], default: 'patient' },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

// Efficient chat list queries — sorted by most recently updated
chatSchema.index({ userId: 1, updatedAt: -1 });
chatSchema.index({ userId: 1, chatType: 1, updatedAt: -1 });

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;
