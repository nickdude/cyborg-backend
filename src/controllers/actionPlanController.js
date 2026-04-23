const ActionPlan = require("../models/ActionPlan");
const ReportData = require("../models/ReportData");

const createPlan = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { reportId } = req.body;

    if (!reportId) {
      return res.sendError("reportId is required", 400);
    }

    const report = await ReportData.findOne({ _id: reportId, userId });
    if (!report) {
      return res.sendError("Report not found", 404);
    }

    const existing = await ActionPlan.findOne({ userId, reportId });
    if (existing) {
      return res.sendSuccess(
        { planId: existing._id, status: existing.status },
        "Action plan already exists for this report"
      );
    }

    const plan = await ActionPlan.create({ userId, reportId, status: "pending" });

    const { triggerGoalsAndActionPlan } = require("../services/actionPlanGenerator");
    triggerGoalsAndActionPlan(userId, reportId, plan._id).catch((err) =>
      console.error(`[ActionPlan] bg-gen failed: ${err.message}`)
    );

    res.status(202).json({
      success: true,
      statusCode: 202,
      message: "Action plan generation started",
      data: { planId: plan._id, status: "pending" },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

const getPlan = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { planId } = req.params;

    const plan = await ActionPlan.findOne({ _id: planId, userId }).populate("goalIds");
    if (!plan) {
      return res.sendError("Action plan not found", 404);
    }

    res.sendSuccess(
      {
        _id: plan._id,
        status: plan.status,
        errorMessage: plan.errorMessage,
        overview: plan.overview,
        healthReport: plan.healthReport,
        monitoredIssues: plan.goalIds,
        protocol: plan.protocol,
        nextSteps: plan.nextSteps,
        planJson: plan.planJson,
        reportId: plan.reportId,
        generatedAt: plan.generatedAt,
        createdAt: plan.createdAt,
      },
      "Action plan retrieved"
    );
  } catch (error) {
    next(error);
  }
};

const getLatestPlan = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const plan = await ActionPlan.findOne({ userId, status: "ready" })
      .sort({ createdAt: -1 })
      .populate("goalIds");

    if (!plan) {
      return res.sendError("No action plan found. Upload a blood report first.", 404);
    }

    res.sendSuccess(
      {
        _id: plan._id,
        status: plan.status,
        overview: plan.overview,
        healthReport: plan.healthReport,
        monitoredIssues: plan.goalIds,
        protocol: plan.protocol,
        nextSteps: plan.nextSteps,
        planJson: plan.planJson,
        reportId: plan.reportId,
        generatedAt: plan.generatedAt,
        createdAt: plan.createdAt,
      },
      "Latest action plan retrieved"
    );
  } catch (error) {
    next(error);
  }
};

const retryPlan = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { planId } = req.params;

    const plan = await ActionPlan.findOne({ _id: planId, userId });
    if (!plan) {
      return res.sendError("Action plan not found", 404);
    }

    if (plan.status !== "failed") {
      return res.sendError("Only failed plans can be retried", 400);
    }

    if (plan.generationAttempts >= 3) {
      return res.sendError("Maximum retry attempts reached", 400);
    }

    plan.status = "pending";
    plan.errorMessage = null;
    await plan.save();

    const { triggerGoalsAndActionPlan } = require("../services/actionPlanGenerator");
    triggerGoalsAndActionPlan(userId, plan.reportId, plan._id).catch((err) =>
      console.error(`[ActionPlan] retry bg-gen failed: ${err.message}`)
    );

    res.sendSuccess({ planId: plan._id, status: "pending" }, "Retry started");
  } catch (error) {
    next(error);
  }
};

const exportPlanPDF = async (req, res, next) => {
  try {
    return res.sendError("PDF export not yet implemented", 501);
  } catch (error) {
    next(error);
  }
};

module.exports = { createPlan, getPlan, getLatestPlan, retryPlan, exportPlanPDF };
