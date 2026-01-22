const axios = require("axios");
const ActionPlan = require("../models/ActionPlan");
const BloodReport = require("../models/BloodReport");
const Notification = require("../models/Notification");
const { generateActionPlanPDF } = require("../utils/pdfGenerator");
const { generateMockActionPlan } = require("../utils/mockAI");

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

const callAiApi = async (report) => {
  const aiUrl = process.env.AI_API_URL;
  const aiKey = process.env.AI_API_KEY;

  // Use mock AI if AI_API_URL not configured or if it's the default example
  if (!aiUrl || aiUrl.includes("example.com")) {
    console.log("Using mock AI service (5 second delay)...");
    const mockPlan = await generateMockActionPlan(5000);
    // Add labs reviewed info to mock plan
    mockPlan.labsReviewed = {
      fileName: report.fileName,
      uploadedAt: report.uploadedAt,
    };
    return mockPlan;
  }

  try {
    const response = await axios.post(
      aiUrl,
      {
        reportPath: report.filePath,
        userId: String(report.userId),
      },
      {
        headers: aiKey ? { Authorization: `Bearer ${aiKey}` } : {},
        timeout: 30000,
      }
    );

    return response.data?.actionPlan || buildFallbackPlan(report);
  } catch (err) {
    console.log("AI API error, falling back to mock:", err.message);
    const mockPlan = await generateMockActionPlan(1000); // Faster fallback
    // Add labs reviewed info
    mockPlan.labsReviewed = {
      fileName: report.fileName,
      uploadedAt: report.uploadedAt,
    };
    return mockPlan;
  }
};

const processActionPlan = async (actionPlanId) => {
  const plan = await ActionPlan.findById(actionPlanId);
  if (!plan || plan.status !== "pending") return;

  const report = await BloodReport.findById(plan.reportId);
  if (!report) {
    plan.status = "failed";
    plan.errorMessage = "Blood report not found";
    plan.failedAt = new Date();
    await plan.save();
    return;
  }

  try {
    const planJson = await callAiApi(report);
    plan.planJson = planJson;
    plan.status = "ready";
    plan.readyAt = new Date();
    plan.errorMessage = null;
    plan.failedAt = null;
    await plan.save();

    // Link back to blood report for quick access
    report.actionPlanId = plan._id;
    await report.save();

    // Persist notification for bell polling (websocket can be added later)
    await Notification.create({
      userId: plan.userId,
      type: "actionPlan:ready",
      metadata: { planId: plan._id, reportId: plan.reportId },
    });
  } catch (err) {
    plan.status = "failed";
    plan.errorMessage = err.message || "Failed to generate action plan";
    plan.failedAt = new Date();
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

    const existing = await ActionPlan.findOne({ reportId });
    if (existing && existing.status === "pending") {
      return res.sendSuccess(
        { planId: existing._id, status: existing.status },
        "Action plan generation already in progress",
        202
      );
    }

    if (existing && existing.status === "ready") {
      return res.sendSuccess(
        {
          planId: existing._id,
          status: existing.status,
          planJson: existing.planJson,
          readyAt: existing.readyAt,
        },
        "Action plan already generated"
      );
    }

    const plan = await ActionPlan.create({
      userId,
      reportId,
      status: "pending",
    });

    report.actionPlanId = plan._id;
    await report.save();

    enqueuePlanGeneration(plan._id);

    res.sendSuccess(
      { planId: plan._id, status: plan.status },
      "Action plan generation started",
      202
    );
  } catch (error) {
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

    plan.status = "pending";
    plan.planJson = null;
    plan.errorMessage = null;
    plan.readyAt = null;
    plan.failedAt = null;
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
