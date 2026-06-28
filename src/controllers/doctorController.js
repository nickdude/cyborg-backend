const mongoose = require("mongoose");
const Chat = require("../models/Chat");
const User = require("../models/User");
const CoreFact = require("../models/CoreFact");
const ReportData = require("../models/ReportData");
const Goal = require("../models/Goal");
const ActionPlan = require("../models/ActionPlan");
const { notify } = require("../utils/notificationHelper");
const { buildDoctorSystemPrompt } = require("../prompts/doctorChat");
const { buildContextMessages } = require("../utils/context");
const { streamChat, getProvider, getModelName } = require("../providers/ai");
const { runPostProcessing } = require("../services/postProcessing");
const { deduplicateProtocol } = require("../utils/protocolDedup");

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
  try {
    switch (name) {
      case "webSearch":
        return await webSearchExec(input, patientId, chatId);
      case "getMedicalData":
        return await getMedicalDataExec(input, patientId, chatId);
      case "suggestMedication":
        return await suggestMedicationExec(input, patientId, chatId);
      case "searchMedicalEvidence":
        return await searchMedicalEvidenceExec(input, patientId, chatId);
      case "getSchemaInfo":
        return await getSchemaInfoExec(input, patientId, chatId);
      case "searchChatHistory":
        return await searchChatHistoryExec(input, patientId, chatId);
      case "fetchFullChat":
        return await fetchFullChatExec(input, patientId, chatId);
      case "getWearableData":
        return await getWearableDataExec(input, patientId, chatId);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    // Tool failures (invalid AI-supplied ids, DB errors, etc.) must not abort
    // the whole SSE turn. Return the same { error } shape tools already use so
    // the model can recover and the turn still completes/saves.
    console.error(`[doctor][tool:${name}] execution error:`, err.message);
    return { error: err.message };
  }
}

/**
 * Fetch patient context for the doctor system prompt.
 */
async function getPatientContext(patientId) {
  try {
    const [user, coreFacts] = await Promise.all([
      User.findById(patientId)
        .select("firstName onboardingCompleted onboardingData bloodReport bloodReports")
        .lean(),
      CoreFact.find({ userId: patientId }).sort({ importance: 1 }).limit(30).lean().catch(() => []),
    ]);
    if (!user) return {};
    return {
      firstName: user.firstName,
      onboardingCompleted: user.onboardingCompleted,
      onboardingData: user.onboardingData || {},
      hasReport: !!user.bloodReport || (Array.isArray(user.bloodReports) && user.bloodReports.length > 0),
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
    const patients = await User.find({ isDeleted: { $ne: true }, userType: "user", linkedDoctor: req.user.id })
      .select("firstName lastName email phone dateOfBirth biologicalSex onboardingCompleted createdAt bloodReports")
      .sort({ firstName: 1 })
      .lean();

    if (patients.length === 0) {
      return res.sendSuccess([], "No patients found");
    }

    const patientIds = patients.map((p) => p._id);

    const [latestReports, goalCounts] = await Promise.all([
      ReportData.aggregate([
        { $match: { userId: { $in: patientIds }, status: { $nin: ["failed"] } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$userId",
            scores: { $first: "$scores" },
            reportDate: { $first: "$reportDate" },
            biomarkerCount: {
              $first: {
                $size: {
                  $filter: {
                    input: { $ifNull: ["$biomarkerPanel", []] },
                    as: "b",
                    cond: { $ne: ["$$b.numericValue", null] },
                  },
                },
              },
            },
            flaggedCount: {
              $first: {
                $size: {
                  $filter: {
                    input: { $ifNull: ["$biomarkerPanel", []] },
                    as: "b",
                    cond: {
                      $and: [
                        { $ne: ["$$b.numericValue", null] },
                        { $in: ["$$b.flag", ["high", "low", "critical"]] },
                      ],
                    },
                  },
                },
              },
            },
            apobValue: {
              $first: {
                $let: {
                  vars: {
                    apob: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: { $ifNull: ["$biomarkerPanel", []] },
                            as: "b",
                            cond: { $eq: ["$$b.canonicalName", "apob"] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: "$$apob.numericValue",
                },
              },
            },
          },
        },
      ]),
      Goal.aggregate([
        { $match: { userId: { $in: patientIds } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
      ]),
    ]);

    const reportMap = new Map(latestReports.map((r) => [r._id.toString(), r]));
    const goalMap = new Map(goalCounts.map((g) => [g._id.toString(), g.count]));

    const enriched = patients.map((p) => {
      const pid = p._id.toString();
      const report = reportMap.get(pid);
      const goalCount = goalMap.get(pid) || 0;

      let age = null;
      if (p.dateOfBirth) {
        age = Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      }

      let status = "Normal";
      if (report) {
        if (report.flaggedCount >= 5) status = "Need Attention";
        else if (report.flaggedCount >= 2) status = "Review Pending";
      }

      return {
        ...p,
        age,
        status,
        goalCount,
        scores: report?.scores || null,
        reportDate: report?.reportDate || null,
        biomarkerCount: report?.biomarkerCount || 0,
        flaggedCount: report?.flaggedCount || 0,
        apobValue: report?.apobValue || null,
        bioAge: report?.scores?.bioAge?.phenoAge ?? report?.scores?.bioAge ?? null,
        bioAgeConfidence: report?.scores?.bioAge?.confidence || null,
        bioAgeDelta: report?.scores?.bioAge?.delta ?? null,
        bioAgeGrade: report?.scores?.bioAge?.grade || null,
        cyborgScore: report?.scores?.cyborgScore?.final || null,
        cyborgGrade: report?.scores?.cyborgScore?.grade || null,
        paceOfAging: report?.scores?.paceOfAging?.pace || null,
      };
    });

    res.sendSuccess(enriched, "Patients retrieved successfully");
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

    // SECURITY (IDOR): a doctor may only read patients linked to them. Any
    // ownership failure returns 403 without leaking whether the patient exists.
    try {
      await verifyDoctorOwnership(req.user.id, patientId);
    } catch (ownershipErr) {
      return res.sendError("Not authorized for this patient", 403);
    }

    const [patient, coreFacts, latestReport, goals] = await Promise.all([
      User.findById(patientId)
        .select("firstName lastName email phone dateOfBirth biologicalSex onboardingCompleted onboardingData bloodReport bloodReports")
        .lean(),
      CoreFact.find({ userId: patientId }).sort({ importance: 1 }).limit(30).lean().catch(() => []),
      ReportData.findOne({ userId: patientId }).sort({ createdAt: -1 })
        .select("biomarkerPanel scores reportDate parsedData createdAt")
        .lean(),
      Goal.find({ userId: patientId }).sort({ createdAt: -1 }).lean().catch(() => []),
    ]);

    if (!patient) {
      return res.sendError("Patient not found", 404);
    }

    if (latestReport?.biomarkerPanel) {
      latestReport.biomarkerPanel = latestReport.biomarkerPanel.filter(
        (b) => b.numericValue != null
      );
    }

    res.sendSuccess({ patient, coreFacts, latestReport, goals }, "Patient retrieved successfully");
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
    const filter = {
      userId: req.user.id,
      chatType: "doctor",
      "messages.0": { $exists: true },
    };
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

    // SECURITY (IDOR): a doctor may only create chats for patients linked to
    // them. verifyDoctorOwnership returns the patient (firstName/lastName used
    // for the title) or throws; any failure returns 403 without leaking
    // whether the patient exists.
    let patient;
    try {
      patient = await verifyDoctorOwnership(req.user.id, patientId);
    } catch (ownershipErr) {
      return res.sendError("Not authorized for this patient", 403);
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

    // SECURITY (IDOR / defense-in-depth): ensure the patient is still linked to
    // this doctor before streaming or running any AI tools against their PHI.
    // Performed before SSE headers are sent so we can return a clean 403, and
    // without leaking whether the patient exists.
    try {
      await verifyDoctorOwnership(req.user.id, patientId);
    } catch (ownershipErr) {
      return res.sendError("Not authorized for this patient", 403);
    }

    // Save user message immediately so it's not lost if AI fails
    chat.messages.push({ role: "user", content: message });
    await chat.save();

    const claudeMessages = buildContextMessages(
      chat.messages.map((m) => ({ role: m.role, content: m.content }))
    );

    // Fetch PATIENT context (not doctor context) for system prompt
    const patientContext = await getPatientContext(patientId);

    // Set up SSE response headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const emit = (data) => {
      if (res.writableEnded || res.destroyed || !res.writable) return;
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (err) {
        // Client disconnected — swallow so the agentic loop continues
        // and the final chat.save() still runs.
      }
    };

    try {
      // Wall-clock timeout so a stuck turn can't hang the SSE connection
      // forever. Mirrors the patient handler (chatController.sendMessage).
      const CHAT_TIMEOUT_MS = parseInt(process.env.CHAT_TIMEOUT_MS || "180000", 10);
      let timeoutHandle;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error("chat_timeout")),
          CHAT_TIMEOUT_MS
        );
      });
      const streamPromise = streamChat({
        messages: claudeMessages,
        systemPrompt: buildDoctorSystemPrompt(patientContext),
        tools: TOOLS,
        executeTool: async (name, input) => {
          const result = await executeToolByName(name, input, patientId, chat._id.toString());
          return sanitizeForModel(result);
        },
        emit,
        persona: "doctor",
        enableThinking: isThinkingEnabled() && getProvider() === "claude",
        thinkingBudget: getThinkingBudget(),
        // Stop the agent loop if the client disconnects or the wall-clock
        // timeout ends the response — avoids running tools nobody will see.
        isAborted: () => res.writableEnded || res.destroyed,
      });
      const { text, toolUses, thinkingMap } = await Promise.race([
        streamPromise,
        timeoutPromise,
      ]).finally(() => clearTimeout(timeoutHandle));

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
      if (err?.message === "chat_timeout") {
        emit({
          type: "error",
          message: "The assistant took too long to respond. Please try a simpler question.",
        });
      } else {
        emit({ type: "error", message: "Something went wrong. Please try again." });
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  } catch (error) {
    // If headers haven't been sent yet (pre-SSE error), pass to Express error handler
    if (!res.headersSent) {
      return next(error);
    }
    console.error("[doctor] Pre-stream error after headers sent:", error);
    if (!res.writableEnded) res.end();
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

// ── Action Plan & Goal Management ────────────────────────────────

async function verifyDoctorOwnership(doctorId, patientId) {
  const patient = await User.findById(patientId).select("linkedDoctor firstName lastName").lean();
  if (!patient) {
    const err = new Error("Patient not found");
    err.status = 404;
    throw err;
  }
  if (!patient.linkedDoctor || String(patient.linkedDoctor) !== String(doctorId)) {
    const err = new Error("Not authorized for this patient");
    err.status = 403;
    throw err;
  }
  return patient;
}

const EDITABLE_STATUSES = ["pending_review", "draft"];

const getPatientActionPlan = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    await verifyDoctorOwnership(req.user.id, patientId);

    const plan = await ActionPlan.findOne({
      userId: patientId,
      status: { $nin: ["superseded", "failed"] },
    })
      .sort({ createdAt: -1 })
      .populate({
        path: "goalIds",
        match: { deletedByDoctor: { $ne: true } },
      });

    if (!plan) {
      return res.sendError("No action plan found for this patient", 404);
    }

    const report = await ReportData.findById(plan.reportId)
      .select("scores biomarkerPanel reportDate filename")
      .lean();

    const deduplicatedProtocol = deduplicateProtocol(plan.goalIds || []);

    res.sendSuccess({
      _id: plan._id,
      status: plan.status,
      overview: plan.overview,
      healthReport: plan.healthReport,
      goals: plan.goalIds || [],
      protocol: plan.protocol,
      deduplicatedProtocol,
      clinicalThesis: plan.clinicalThesis,
      checkpoints: plan.checkpoints,
      watchOuts: plan.watchOuts,
      dailySchedule: plan.dailySchedule,
      trainingProtocol: plan.trainingProtocol,
      nextSteps: plan.nextSteps,
      reportId: plan.reportId,
      generatedAt: plan.generatedAt,
      approvedBy: plan.approvedBy,
      approvedAt: plan.approvedAt,
      draftSavedAt: plan.draftSavedAt,
      report: report ? {
        scores: report.scores,
        reportDate: report.reportDate,
        filename: report.filename,
      } : null,
    }, "Action plan retrieved");
  } catch (error) {
    if (error.status) return res.sendError(error.message, error.status);
    next(error);
  }
};

const updatePatientGoals = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const { goals } = req.body;
    await verifyDoctorOwnership(req.user.id, patientId);

    if (!Array.isArray(goals) || goals.length === 0) {
      return res.sendError("Goals array is required", 400);
    }

    const plan = await ActionPlan.findOne({
      userId: patientId,
      status: { $in: EDITABLE_STATUSES },
    }).sort({ createdAt: -1 });

    if (!plan) {
      return res.sendError("No editable action plan found", 404);
    }

    const updated = [];
    for (const g of goals) {
      if (!g._id) continue;
      const doc = await Goal.findOneAndUpdate(
        { _id: g._id, userId: patientId },
        {
          ...(g.title !== undefined && { title: g.title }),
          ...(g.description !== undefined && { description: g.description }),
          ...(g.priority !== undefined && { priority: g.priority }),
          ...(g.whatThisMeans !== undefined && { whatThisMeans: g.whatThisMeans }),
          ...(g.potentialCauses !== undefined && { potentialCauses: g.potentialCauses }),
          ...(g.recommendedActions !== undefined && { recommendedActions: g.recommendedActions }),
          editedByDoctor: true,
        },
        { new: true }
      );
      if (doc) updated.push(doc);
    }

    await ActionPlan.findByIdAndUpdate(plan._id, {
      status: "draft",
      draftSavedAt: new Date(),
    });

    res.sendSuccess({ goals: updated, planStatus: "draft" }, "Goals updated");
  } catch (error) {
    if (error.status) return res.sendError(error.message, error.status);
    next(error);
  }
};

const addGoal = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const { title, description, priority, whatThisMeans, potentialCauses, recommendedActions } = req.body;
    await verifyDoctorOwnership(req.user.id, patientId);

    if (!title) return res.sendError("Title is required", 400);

    const plan = await ActionPlan.findOne({
      userId: patientId,
      status: { $in: EDITABLE_STATUSES },
    }).sort({ createdAt: -1 });

    if (!plan) {
      return res.sendError("No editable action plan found", 404);
    }

    const goal = await Goal.create({
      userId: patientId,
      reportId: plan.reportId,
      goalId: "dr-" + new mongoose.Types.ObjectId().toString(),
      title,
      description: description || "",
      priority: priority || "Medium",
      whatThisMeans: whatThisMeans || "",
      potentialCauses: potentialCauses || "",
      recommendedActions: recommendedActions || [],
      addedByDoctor: true,
    });

    await ActionPlan.findByIdAndUpdate(plan._id, {
      $push: { goalIds: goal._id },
      status: "draft",
      draftSavedAt: new Date(),
    });

    res.sendSuccess(goal, "Goal added");
  } catch (error) {
    if (error.status) return res.sendError(error.message, error.status);
    next(error);
  }
};

const deleteGoal = async (req, res, next) => {
  try {
    const { patientId, goalId } = req.params;
    await verifyDoctorOwnership(req.user.id, patientId);

    const plan = await ActionPlan.findOne({
      userId: patientId,
      status: { $in: EDITABLE_STATUSES },
    }).sort({ createdAt: -1 });

    if (!plan) {
      return res.sendError("No editable action plan found", 404);
    }

    const goal = await Goal.findOneAndUpdate(
      { _id: goalId, userId: patientId },
      { deletedByDoctor: true },
      { new: true }
    );
    if (!goal) return res.sendError("Goal not found", 404);

    await ActionPlan.findByIdAndUpdate(plan._id, {
      status: "draft",
      draftSavedAt: new Date(),
    });

    res.sendSuccess(null, "Goal deleted");
  } catch (error) {
    if (error.status) return res.sendError(error.message, error.status);
    next(error);
  }
};

const approveActionPlan = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    await verifyDoctorOwnership(req.user.id, patientId);

    const plan = await ActionPlan.findOne({
      userId: patientId,
      status: { $in: EDITABLE_STATUSES },
    }).sort({ createdAt: -1 });

    if (!plan) {
      return res.sendError("No action plan pending approval", 404);
    }

    const activeGoalCount = await Goal.countDocuments({
      reportId: plan.reportId,
      userId: patientId,
      deletedByDoctor: { $ne: true },
    });

    if (activeGoalCount === 0) {
      return res.sendError("Cannot approve — no goals exist. Add at least one goal first.", 400);
    }

    await ActionPlan.findByIdAndUpdate(plan._id, {
      status: "approved",
      approvedBy: req.user.id,
      approvedAt: new Date(),
    });

    await User.findByIdAndUpdate(patientId, {
      actionPlanReady: true,
      goalsApproved: true,
    });

    await notify(patientId, "goals:approved", {
      planId: plan._id,
      reportId: plan.reportId,
    });

    res.sendSuccess({ planId: plan._id }, "Action plan approved");
  } catch (error) {
    if (error.status) return res.sendError(error.message, error.status);
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
  getPatientActionPlan,
  updatePatientGoals,
  addGoal,
  deleteGoal,
  approveActionPlan,
};
