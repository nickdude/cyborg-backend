const axios = require("axios");
const ActionPlan = require("../models/ActionPlan");
const BloodReport = require("../models/BloodReport");
const OnboardingAnswer = require("../models/OnboardingAnswer");
const Questionnaire = require("../models/Questionnaire");
const Notification = require("../models/Notification");
const { generateActionPlanPDF } = require("../utils/pdfGenerator");
const { generateMockActionPlan } = require("../utils/mockAI");
const realAIService = require("../utils/realAIService");

// Kick off async processing after creation (lightweight in-process queue)
const enqueuePlanGeneration = (actionPlanId) => {
  setTimeout(() => {
    processActionPlan(actionPlanId).catch((err) => {
      console.error("Action plan worker error", err.message);
    });
  }, 25);
};

// Build a fallback plan if AI API is not configured
const buildFallbackPlan = (report) => ({
  summary: "Personalized action plan based on your latest labs.",
  recommendations: [
    {
      title: "Nutrition",
      items: [
        "Increase leafy greens and cruciferous vegetables",
        "Prioritize lean protein: 1.6-2.2g/kg body weight",
        "Omega-3 intake: 2-3 servings of fatty fish weekly",
      ],
    },
    {
      title: "Training",
      items: [
        "3x/week resistance training focusing on compound lifts",
        "2x/week zone 2 cardio (30-40 mins)",
        "1x/week mobility + core session",
      ],
    },
    {
      title: "Recovery & Sleep",
      items: [
        "Aim for 7.5-8.5 hours sleep with consistent schedule",
        "Finish last meal 3 hours before bed",
        "Evening wind-down: low light, no screens 60 mins prior",
      ],
    },
  ],
  labsReviewed: {
    fileName: report.fileName,
    uploadedAt: report.uploadedAt,
  },
});

/**
 * Call real AI API with fallback to mock
 * Handles real async API with job tracking
 */
const callRealAiApi = async (report, actionPlan) => {
  const useRealAi = process.env.USE_REAL_AI === "true";

  // Use mock AI if disabled or not configured
  if (!useRealAi) {
    console.log("[ActionPlan] USE_REAL_AI disabled, using mock AI service");
    const mockPlan = await generateMockActionPlan(5000);
    mockPlan.labsReviewed = {
      fileName: report.fileName,
      uploadedAt: report.uploadedAt,
    };
    return {
      planJson: mockPlan,
      jobStatus: "completed",
      externalJobId: null,
    };
  }

  try {
    console.log("[ActionPlan] Submitting to real AI API", {
      reportId: report._id,
      useRealAi,
    });

    // Update action plan with submission attempt
    actionPlan.jobStatus = "submitting";
    actionPlan.jobUpdatedAt = new Date();
    await actionPlan.save();

    // Submit job to real API
    const jobId = await realAIService.submitPlanRequest(
      String(report._id),
      actionPlan.questionnaireId || "unknown",
      actionPlan.onboardingAnswersId || "unknown"
    );

    // Update with job ID
    actionPlan.externalJobId = jobId;
    actionPlan.jobStatus = "processing";
    actionPlan.jobUpdatedAt = new Date();
    await actionPlan.save();

    console.log("[ActionPlan] Job submitted successfully", {
      planId: actionPlan._id,
      jobId,
    });

    // Poll until ready
    const pollResult = await realAIService.pollUntilReady(jobId);

    const planJson = pollResult.result?.actionPlan || buildFallbackPlan(report);
    planJson.labsReviewed = {
      fileName: report.fileName,
      uploadedAt: report.uploadedAt,
    };

    return {
      planJson,
      jobStatus: "completed",
      externalJobId: jobId,
      pollCount: pollResult.pollCount,
      elapsedMs: pollResult.elapsedMs,
    };
  } catch (err) {
    console.log("[ActionPlan] Real AI error, falling back to mock:", err.message);

    // Update status to failed but allow retry
    actionPlan.jobStatus = "failed";
    actionPlan.jobUpdatedAt = new Date();
    await actionPlan.save();

    // Fallback to mock
    const mockPlan = await generateMockActionPlan(1000);
    mockPlan.labsReviewed = {
      fileName: report.fileName,
      uploadedAt: report.uploadedAt,
    };

    return {
      planJson: mockPlan,
      jobStatus: "failed",
      externalJobId: actionPlan.externalJobId || null,
      error: err.message,
    };
  }
};

const processActionPlan = async (actionPlanId) => {
  const plan = await ActionPlan.findById(actionPlanId);
  if (!plan || plan.status !== "pending") {
    console.log("[ActionPlan] Skipping process: not in pending state", {
      planId: actionPlanId,
      status: plan?.status,
    });
    return;
  }

  const report = await BloodReport.findById(plan.reportId);
  if (!report) {
    console.error("[ActionPlan] Blood report not found", { reportId: plan.reportId });
    plan.status = "failed";
    plan.errorMessage = "Blood report not found";
    plan.failedAt = new Date();
    await plan.save();
    return;
  }

  try {
    console.log("[ActionPlan] Starting async generation", {
      planId: plan._id,
      reportId: plan.reportId,
    });

    // Call real AI service with fallback
    const aiResult = await callRealAiApi(report, plan);

    // Save result to plan
    plan.planJson = aiResult.planJson;
    plan.status = "ready";
    plan.readyAt = new Date();
    plan.externalJobId = aiResult.externalJobId;
    plan.jobStatus = aiResult.jobStatus;
    plan.jobUpdatedAt = new Date();
    plan.errorMessage = null;
    plan.failedAt = null;

    if (aiResult.error) {
      // Log error but still mark as ready since we have fallback data
      console.warn("[ActionPlan] Fallback plan generated due to error", {
        planId: plan._id,
        error: aiResult.error,
      });
    }

    await plan.save();

    // Link back to blood report for quick access
    report.actionPlanId = plan._id;
    await report.save();

    // Create notification for user
    await Notification.create({
      userId: plan.userId,
      type: "actionPlan:ready",
      metadata: { planId: plan._id, reportId: plan.reportId },
    });

    console.log("[ActionPlan] Generation completed successfully", {
      planId: plan._id,
      status: plan.status,
      jobId: plan.externalJobId,
    });
  } catch (err) {
    console.error("[ActionPlan] Generation failed", {
      planId: plan._id,
      error: err.message,
      stack: err.stack,
    });

    plan.status = "failed";
    plan.errorMessage = err.message || "Failed to generate action plan";
    plan.failedAt = new Date();
    plan.retryCount = (plan.retryCount || 0) + 1;
    plan.lastRetryAt = new Date();

    await plan.save();
  }
};

// POST /api/action-plans
const createActionPlan = async (req, res, next) => {
  try {
    const { reportId } = req.body;
    const userId = req.user.id || req.user._id;

    if (!reportId) {
      return res.sendError("reportId is required", 400);
    }

    const report = await BloodReport.findById(reportId);
    if (!report || String(report.userId) !== userId) {
      return res.sendError("Blood report not found", 404);
    }

    const answers = await OnboardingAnswer.findOne({ userId });
    const questionnaire = await Questionnaire.findOne({});
     
    if (!questionnaire) {
      return res.sendError("Active questionnaire not found", 500);
    }

    // Create new action plan entry
    const aiResponse = await axios.post(
      `${process.env.AI_API_URL}/report/jobs/mongo-ids`,
      {
        blood_report_id: reportId,
        questionnaire_id: questionnaire ? questionnaire._id : null,
        onboarding_answers_id: answers ? answers._id : null,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": "local-dev-key",
        },
        timeout: 60000,
      }
    );

    report.jobId = aiResponse.data.job_id;
    await report.save();

    return res.sendSuccess(
      {
        message: "Action plan generating successfully",
        aiResponse: aiResponse.data,
      },
      201
    );
  
  } catch (error) {
    console.error("AI ERROR STATUS:", error?.response?.status);
    console.error("AI ERROR DATA:", error?.response?.data);
    console.error("AI ERROR HEADERS:", error?.response?.headers);
    next(error);
  }
};

// GET /api/action-plans/:id
const getActionPlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id;
    const plan = await ActionPlan.findById(id);

    if (!plan || String(plan.userId) !== userId) {
      return res.sendError("Action plan not found", 404);
    }

    res.sendSuccess(plan);
  } catch (error) {
    next(error);
  }
};

// POST /api/action-plans/:id/retry
const retryActionPlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id;
    const plan = await ActionPlan.findById(id);

    if (!plan || String(plan.userId) !== userId) {
      return res.sendError("Action plan not found", 404);
    }

    if (plan.status === "pending") {
      return res.sendSuccess({ planId: plan._id, status: plan.status }, "Already pending");
    }

    // Reset to pending state for retry
    plan.status = "pending";
    plan.planJson = null;
    plan.errorMessage = null;
    plan.readyAt = null;
    plan.failedAt = null;
    plan.externalJobId = null;
    plan.jobStatus = null;
    plan.jobUpdatedAt = null;
    await plan.save();

    enqueuePlanGeneration(plan._id);

    res.sendSuccess({ planId: plan._id, status: plan.status }, "Retry started", 202);
  } catch (error) {
    next(error);
  }
};

// POST /api/action-plans/:id/pdf
const exportPDF = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id;
    const plan = await ActionPlan.findById(id);

    if (!plan || String(plan.userId) !== userId) {
      return res.sendError("Action plan not found", 404);
    }

    if (!plan.planJson || plan.status !== "ready") {
      return res.sendError("Action plan is not ready yet", 400);
    }

    const pdfBuffer = await generateActionPlanPDF(plan.planJson);

    res.contentType("application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="action-plan-${plan._id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createActionPlan,
  getActionPlan,
  retryActionPlan,
  exportPDF,
};
