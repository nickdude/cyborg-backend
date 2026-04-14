const Chat = require("../models/Chat");
const User = require("../models/User");
const CoreFact = require("../models/CoreFact");
const { buildDoctorSystemPrompt } = require("../prompts/doctorChat");
const { buildContextMessages } = require("../utils/context");
const { streamChat, getProvider, getModelName } = require("../providers/ai");
const { runPostProcessing } = require("../services/postProcessing");

// Import 8 tools (no memory tools — doctors don't write to patient memory)
const { definition: getMedicalDataDef, execute: getMedicalDataExec } = require("../tools/getMedicalData");
const { definition: getWearableDataDef, execute: getWearableDataExec } = require("../tools/getWearableData");
const { definition: searchChatHistoryDef, execute: searchChatHistoryExec } = require("../tools/searchChatHistory");
const { definition: fetchFullChatDef, execute: fetchFullChatExec } = require("../tools/fetchFullChat");
const { definition: webSearchDef, execute: webSearchExec } = require("../tools/webSearch");
const { definition: searchMedicalEvidenceDef, execute: searchMedicalEvidenceExec } = require("../tools/searchMedicalEvidence");
const { definition: suggestMedicationDef, execute: suggestMedicationExec } = require("../tools/suggestMedication");
const { definition: getSchemaInfoDef, execute: getSchemaInfoExec } = require("../tools/getSchemaInfo");

// Lazy reads — env vars must not be read at module evaluation time
const isThinkingEnabled = () => process.env.ENABLE_THINKING === "true";
const getThinkingBudget = () => parseInt(process.env.THINKING_BUDGET_TOKENS || "8000", 10);

// 8 tool definitions (same as patient chat minus saveMemory and recallMemories)
const TOOLS = [
  webSearchDef,
  getMedicalDataDef,
  suggestMedicationDef,
  searchMedicalEvidenceDef,
  getSchemaInfoDef,
  searchChatHistoryDef,
  fetchFullChatDef,
  getWearableDataDef,
];

/**
 * Recursively strip MongoDB internals so the model never sees them
 * in tool results (and can't leak them in extended thinking).
 */
const STRIP_KEYS = new Set(["_id", "__v", "userId", "embedding", "passwordHash", "password", "token", "secret"]);

function sanitizeForModel(obj, seen = new WeakSet()) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (obj instanceof Date) return obj.toISOString();
  // ObjectId, Buffer, RegExp — coerce to string
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
 * Execute a tool using the PATIENT's userId (not the doctor's).
 * All tools in Backend A use signature: execute(input, userId, chatId)
 */
async function executeToolByName(name, input, patientId, chatId) {
  switch (name) {
    case "webSearch":
      return webSearchExec(input, patientId, chatId);
    case "getMedicalData":
      return getMedicalDataExec(input, patientId, chatId);
    case "suggestMedication":
      return suggestMedicationExec(input, patientId, chatId);
    case "searchMedicalEvidence":
      return searchMedicalEvidenceExec(input, patientId, chatId);
    case "getSchemaInfo":
      return getSchemaInfoExec(input, patientId, chatId);
    case "searchChatHistory":
      return searchChatHistoryExec(input, patientId, chatId);
    case "fetchFullChat":
      return fetchFullChatExec(input, patientId, chatId);
    case "getWearableData":
      return getWearableDataExec(input, patientId, chatId);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/**
 * Fetch patient context for the doctor system prompt.
 */
async function getPatientContext(patientId) {
  try {
    const [user, coreFacts] = await Promise.all([
      User.findById(patientId)
        .select("firstName onboardingCompleted onboardingData bloodReport")
        .lean(),
      CoreFact.find({ userId: patientId }).sort({ importance: 1 }).limit(30).lean(),
    ]);
    if (!user) return {};
    return {
      firstName: user.firstName,
      onboardingCompleted: user.onboardingCompleted,
      onboardingData: user.onboardingData || {},
      hasReport: !!user.bloodReport,
      coreFacts,
    };
  } catch (err) {
    console.warn("[doctor] Failed to fetch patient context:", err.message);
    return {};
  }
}

// ============== PATIENT LISTING ==============

/**
 * List all patients (users with userType='user')
 */
const listPatients = async (req, res, next) => {
  try {
    const patients = await User.find({ isDeleted: { $ne: true }, userType: "user" })
      .select("firstName lastName email onboardingCompleted")
      .sort({ firstName: 1 })
      .lean();

    res.sendSuccess(patients, "Patients retrieved successfully");
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single patient by ID, including their core facts
 */
const getPatient = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    const patient = await User.findById(patientId)
      .select("firstName lastName email onboardingCompleted onboardingData bloodReport")
      .lean();

    if (!patient) {
      return res.sendError("Patient not found", 404);
    }

    const coreFacts = await CoreFact.find({ userId: patientId })
      .sort({ importance: 1 })
      .limit(30)
      .lean();

    res.sendSuccess({ patient, coreFacts }, "Patient retrieved successfully");
  } catch (error) {
    next(error);
  }
};

// ============== DOCTOR CHAT CRUD ==============

/**
 * List doctor chats for the authenticated doctor.
 * Supports optional ?patientId= query param filter.
 */
const listDoctorChats = async (req, res, next) => {
  try {
    const filter = { userId: req.user.id, chatType: "doctor" };
    if (req.query.patientId) {
      filter.patientId = req.query.patientId;
    }

    const chats = await Chat.find(filter)
      .select("title patientId createdAt updatedAt")
      .sort({ updatedAt: -1 });

    res.sendSuccess(chats, "Doctor chats retrieved successfully");
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new doctor chat for a specific patient
 */
const createDoctorChat = async (req, res, next) => {
  try {
    const { patientId } = req.body;

    if (!patientId) {
      return res.sendError("patientId is required", 400);
    }

    const patient = await User.findById(patientId).select("firstName lastName").lean();
    if (!patient) {
      return res.sendError("Patient not found", 404);
    }

    const chat = await Chat.create({
      userId: req.user.id,
      patientId,
      chatType: "doctor",
      title: `${patient.firstName || "Patient"} — New Chat`,
      messages: [],
    });

    res.sendSuccess(chat, "Doctor chat created successfully", 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Get a specific doctor chat by ID
 */
const getDoctorChat = async (req, res, next) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.id,
      userId: req.user.id,
      chatType: "doctor",
    });

    if (!chat) {
      return res.sendError("Chat not found", 404);
    }

    res.sendSuccess(chat, "Doctor chat retrieved successfully");
  } catch (error) {
    next(error);
  }
};

/**
 * Send a message in a doctor chat — SSE streaming handler.
 * Tool execution operates on the patient's data, not the doctor's.
 */
const sendDoctorMessage = async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) {
      return res.sendError("Message is required", 400);
    }

    const chat = await Chat.findOne({
      _id: req.params.id,
      userId: req.user.id,
      chatType: "doctor",
    });

    if (!chat) {
      return res.sendError("Chat not found", 404);
    }

    if (!chat.patientId) {
      return res.sendError("Chat has no associated patient", 400);
    }

    const patientId = chat.patientId.toString();

    // Save user message immediately so it's not lost if AI fails
    chat.messages.push({ role: "user", content: message });
    await chat.save();

    const claudeMessages = buildContextMessages(
      chat.messages.map((m) => ({ role: m.role, content: m.content }))
    );

    // Fetch PATIENT context (not doctor context) for system prompt
    const patientContext = await getPatientContext(patientId);

    // Set up SSE response headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const emit = (data) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      const { text, toolUses, thinkingMap } = await streamChat({
        messages: claudeMessages,
        systemPrompt: buildDoctorSystemPrompt(patientContext),
        tools: TOOLS,
        executeTool: async (name, input) => {
          const result = await executeToolByName(name, input, patientId, chat._id.toString());
          return sanitizeForModel(result);
        },
        emit,
        enableThinking: isThinkingEnabled() && getProvider() === "claude",
        thinkingBudget: getThinkingBudget(),
      });

      console.log(`[doctor][${getProvider()}] Stream complete | model: ${getModelName()}`);

      chat.messages.push({ role: "assistant", content: text, toolUses, thinking: thinkingMap || null });

      // Auto-title: replace "— New Chat" suffix on first exchange
      if (chat.title.endsWith("— New Chat") && chat.messages.length <= 2) {
        chat.title = `${chat.title.replace(" — New Chat", "")} — ${message.slice(0, 40)}`;
      }
      await chat.save();

      // Post-processing runs against the PATIENT's data (fire-and-forget)
      runPostProcessing(patientId, chat._id.toString(), chat.messages)
        .catch((err) => console.error("[doctor][PostProcess] Unhandled error:", err.message));
    } catch (err) {
      console.error("[doctor][SSE] Stream error:", err);
      emit({ type: "error", message: "Something went wrong. Please try again." });
    } finally {
      if (!res.writableEnded) res.end();
    }
  } catch (error) {
    // If headers haven't been sent yet (pre-SSE error), pass to Express error handler
    if (!res.headersSent) {
      return next(error);
    }
    console.error("[doctor] Pre-stream error after headers sent:", error);
  }
};

/**
 * Update doctor chat title
 */
const updateDoctorChat = async (req, res, next) => {
  try {
    const { title } = req.body;

    const chat = await Chat.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, chatType: "doctor" },
      { title },
      { new: true }
    );

    if (!chat) {
      return res.sendError("Chat not found", 404);
    }

    res.sendSuccess(chat, "Doctor chat updated successfully");
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a doctor chat
 */
const deleteDoctorChat = async (req, res, next) => {
  try {
    const chat = await Chat.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
      chatType: "doctor",
    });

    if (!chat) {
      return res.sendError("Doctor chat not found", 404);
    }

    res.sendSuccess(null, "Doctor chat deleted successfully");
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listPatients,
  getPatient,
  listDoctorChats,
  createDoctorChat,
  getDoctorChat,
  sendDoctorMessage,
  updateDoctorChat,
  deleteDoctorChat,
};
