const mongoose = require("mongoose");
const ActionPlan = require("../models/ActionPlan");
const ReportData = require("../models/ReportData");

const GOAL_FIELDS = "goalId title priority healthImpact category description whatThisMeans potentialCauses recommendedActions biomarkerEvidence protocolItems delta recoveryTimeWeeks";

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);
}

const createPlan = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { reportId } = req.body;

    if (!reportId || !isValidObjectId(reportId)) {
      return res.sendError("Valid reportId is required", 400);
    }

    const report = await ReportData.findOne({ _id: reportId, userId });
    if (!report) {
      return res.sendError("Report not found", 404);
    }

    // Atomic upsert prevents race condition on concurrent requests
    const plan = await ActionPlan.findOneAndUpdate(
      { userId, reportId },
      { $setOnInsert: { status: "pending" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (plan.status !== "pending") {
      return res.sendSuccess(
        { planId: plan._id, status: plan.status },
        "Action plan already exists for this report"
      );
    }

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

    if (!isValidObjectId(planId)) {
      return res.sendError("Invalid plan ID", 400);
    }

    const plan = await ActionPlan.findOne({ _id: planId, userId })
      .populate("goalIds", GOAL_FIELDS);
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
      .populate("goalIds", GOAL_FIELDS);

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

    if (!isValidObjectId(planId)) {
      return res.sendError("Invalid plan ID", 400);
    }

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
