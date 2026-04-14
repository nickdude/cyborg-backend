const Chat = require("../models/Chat");
const User = require("../models/User");
const CoreFact = require("../models/CoreFact");
const { buildSystemPrompt } = require("../prompts/chat");
const { buildContextMessages } = require("../utils/context");
const { streamChat } = require("../providers/ai");
const { runPostProcessing } = require("../services/postProcessing");

// Import all 10 tools
const { definition: getMedicalDataDef, execute: getMedicalDataExec } = require("../tools/getMedicalData");
const { definition: getWearableDataDef, execute: getWearableDataExec } = require("../tools/getWearableData");
const { definition: searchChatHistoryDef, execute: searchChatHistoryExec } = require("../tools/searchChatHistory");
const { definition: fetchFullChatDef, execute: fetchFullChatExec } = require("../tools/fetchFullChat");
const { definition: webSearchDef, execute: webSearchExec } = require("../tools/webSearch");
const { definition: searchMedicalEvidenceDef, execute: searchMedicalEvidenceExec } = require("../tools/searchMedicalEvidence");
const { definition: suggestMedicationDef, execute: suggestMedicationExec } = require("../tools/suggestMedication");
const { definition: getSchemaInfoDef, execute: getSchemaInfoExec } = require("../tools/getSchemaInfo");
const { saveMemoryTool, recallMemoriesTool } = require("../tools/episodicMemory");

// All 10 tool definitions for the AI model
const TOOLS = [
  webSearchDef,
  getMedicalDataDef,
  suggestMedicationDef,
  searchMedicalEvidenceDef,
  getSchemaInfoDef,
  searchChatHistoryDef,
  fetchFullChatDef,
  saveMemoryTool.definition,
  recallMemoriesTool.definition,
  getWearableDataDef,
];

/**
 * Sensitive fields to strip from tool results before sending to the model.
 * Prevents leaking internal IDs, credentials, and PII in extended thinking.
 */
const STRIP_KEYS = new Set([
  "_id",
  "__v",
  "userId",
  "password",
  "passwordHash",
  "passwordSalt",
  "embedding",
  "resetToken",
  "resetTokenExpiry",
  "emailOTP",
  "emailOTPExpiry",
  "phoneOTP",
  "phoneOTPExpiry",
]);

/**
 * Recursively strip MongoDB internals so the model never sees them
 * in tool results (and can't leak them in extended thinking).
 */
function sanitizeForModel(obj, seen = new WeakSet()) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (obj instanceof Date) return obj.toISOString();
  // ObjectId, Buffer, RegExp -- coerce to string
  if (typeof obj.toJSON === "function") return obj.toJSON();
  if (seen.has(obj)) return undefined;
  seen.add(obj);
  if (Array.isArray(obj)) return obj.map((v) => sanitizeForModel(v, seen));
  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    if (STRIP_KEYS.has(key)) continue;
    clean[key] = sanitizeForModel(val, seen);
  }
  return clean;
}

/**
 * Map tool name to its execute function.
 */
async function executeToolByName(name, input, userId, chatId) {
  switch (name) {
    case "webSearch":
      return webSearchExec(input, userId, chatId);
    case "getMedicalData":
      return getMedicalDataExec(input, userId, chatId);
    case "suggestMedication":
      return suggestMedicationExec(input, userId, chatId);
    case "searchMedicalEvidence":
      return searchMedicalEvidenceExec(input, userId, chatId);
    case "getSchemaInfo":
      return getSchemaInfoExec(input, userId, chatId);
    case "searchChatHistory":
      return searchChatHistoryExec(input, userId, chatId);
    case "fetchFullChat":
      return fetchFullChatExec(input, userId, chatId);
    case "saveMemory":
      return saveMemoryTool.execute(input, userId, chatId);
    case "recallMemories":
      return recallMemoriesTool.execute(input, userId, chatId);
    case "getWearableData":
      return getWearableDataExec(input, userId, chatId);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/**
 * Fetch lightweight user context for the system prompt.
 * Only selects fields needed for dynamic context -- no sensitive data.
 */
async function getUserContext(userId) {
  try {
    const [user, coreFacts] = await Promise.all([
      User.findById(userId)
        .select("firstName onboardingCompleted onboardingData bloodReport bloodReports")
        .lean(),
      CoreFact.find({ userId }).sort({ importance: 1 }).limit(30).lean(),
    ]);
    if (!user) return {};
    const reportCount = user.bloodReports?.length || (user.bloodReport ? 1 : 0);
    return {
      firstName: user.firstName,
      onboardingCompleted: user.onboardingCompleted,
      onboardingData: user.onboardingData || {},
      hasReport: reportCount > 0,
      reportCount,
      coreFacts,
    };
  } catch (err) {
    console.warn("[chat] Failed to fetch user context:", err.message);
    return {};
  }
}

// ============== CONTROLLER FUNCTIONS ==============

/**
 * List all patient chats for the authenticated user.
 * Returns only metadata (no messages) sorted by most recently updated.
 */
const listChats = async (req, res, next) => {
  try {
    const chats = await Chat.find({
      userId: req.user.id,
      chatType: "patient",
    })
      .select("_id title createdAt updatedAt")
      .sort({ updatedAt: -1 });

    res.sendSuccess(chats, "Chats retrieved successfully");
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new patient chat.
 */
const createChat = async (req, res, next) => {
  try {
    const chat = await Chat.create({
      userId: req.user.id,
      title: "New Chat",
      messages: [],
      chatType: "patient",
    });

    res.sendSuccess(chat, "Chat created successfully", 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single chat with all messages.
 * Verifies the authenticated user owns the chat.
 */
const getChat = async (req, res, next) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!chat) {
      return res.sendError("Chat not found", 404);
    }

    res.sendSuccess(chat, "Chat retrieved successfully");
  } catch (error) {
    next(error);
  }
};

/**
 * Send a message and stream the AI response via SSE.
 * This is the critical agentic chat handler with tool use and post-processing.
 */
const sendMessage = async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) {
      return res.sendError("Message is required", 400);
    }

    const userId = req.user.id;

    // 1. Load chat, verify ownership
    const chat = await Chat.findOne({ _id: req.params.id, userId });
    if (!chat) {
      return res.sendError("Chat not found", 404);
    }

    // 2. Append user message and save immediately so it's not lost if AI fails
    chat.messages.push({ role: "user", content: message });
    await chat.save();

    // 3. Build context messages for the AI
    const contextMessages = buildContextMessages(
      chat.messages.map((m) => ({ role: m.role, content: m.content }))
    );

    // 4. Fetch user context for dynamic system prompt
    const userContext = await getUserContext(userId);

    // 5. Build system prompt
    const systemPrompt = buildSystemPrompt(userContext);

    // 6. Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // 7. Create emit function
    const emit = (data) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    // 8. Determine thinking settings
    const enableThinking = process.env.ENABLE_THINKING === "true";
    const thinkingBudget = parseInt(process.env.THINKING_BUDGET_TOKENS || "8000", 10);

    try {
      // 9. Call streamChat with agentic loop
      const { text, toolUses, thinkingMap } = await streamChat({
        messages: contextMessages,
        systemPrompt,
        tools: TOOLS,
        executeTool: async (name, input) => {
          const raw = await executeToolByName(name, input, userId, chat._id.toString());
          return sanitizeForModel(raw);
        },
        emit,
        enableThinking,
        thinkingBudget,
      });

      // 10. Save assistant message
      chat.messages.push({
        role: "assistant",
        content: text,
        toolUses,
        thinking: thinkingMap || null,
      });

      // 11. Auto-set title if still "New Chat"
      if (chat.title === "New Chat" && text) {
        chat.title = text.substring(0, 60).replace(/\n/g, " ").trim();
        if (chat.title.length === 60) chat.title += "\u2026";
      }

      await chat.save();

      // 12. Fire post-processing (non-blocking)
      runPostProcessing(userId, chat._id.toString(), chat.messages).catch(
        (err) => {
          console.error("[PostProcessing] Error:", err.message);
        }
      );
    } catch (err) {
      console.error("[SSE] Stream error:", err);
      emit({ type: "error", message: "Something went wrong. Please try again." });
    } finally {
      // 13. Close SSE
      if (!res.writableEnded) res.end();
    }
  } catch (error) {
    // If headers haven't been sent yet, delegate to Express error handler
    if (!res.headersSent) {
      return next(error);
    }
    // Otherwise headers are already sent (SSE mode); log and close
    console.error("[sendMessage] Pre-stream error:", error);
    if (!res.writableEnded) res.end();
  }
};

/**
 * Update chat title.
 */
const updateChat = async (req, res, next) => {
  try {
    const { title } = req.body;

    const chat = await Chat.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { title },
      { new: true }
    ).select("_id title createdAt updatedAt");

    if (!chat) {
      return res.sendError("Chat not found", 404);
    }

    res.sendSuccess(chat, "Chat updated successfully");
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a chat after verifying ownership.
 */
const deleteChat = async (req, res, next) => {
  try {
    const chat = await Chat.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!chat) {
      return res.sendError("Chat not found", 404);
    }

    res.sendSuccess(null, "Chat deleted successfully");
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listChats,
  createChat,
  getChat,
  sendMessage,
  updateChat,
  deleteChat,
};
