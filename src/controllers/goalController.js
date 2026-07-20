const Goal = require("../models/Goal");
const ActionPlan = require("../models/ActionPlan");
const { generateGoalCards } = require("../services/goalsEngine");

async function getApprovalStatus(userId) {
  const plan = await ActionPlan.findOne({
    userId,
    status: { $nin: ["superseded", "failed"] },
  })
    .sort({ createdAt: -1 })
    .select("status")
    .lean();
  return plan?.status || null;
}

const listGoals = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const planStatus = await getApprovalStatus(userId);

    if (planStatus === "pending" || planStatus === "generating") {
      return res.sendSuccess(
        { goals: [], meta: { status: "generating" } },
        "Your health goals are being generated."
      );
    }

    if (planStatus === "pending_review" || planStatus === "draft") {
      return res.sendSuccess(
        { goals: [], meta: { status: "awaiting_review" } },
        "Your health goals are being reviewed by your doctor."
      );
    }

    // approved or legacy "ready" — show goals
    const filter = { userId, deletedByDoctor: { $ne: true } };
    if (req.query.status) filter.status = req.query.status;

    const persistedGoals = await Goal.find(filter)
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    if (persistedGoals.length > 0) {
      const summaryGoals = persistedGoals.map((g) => ({
        goalId: g.goalId,
        title: g.title,
        priority: g.priority,
        healthImpact: g.healthImpact,
        category: g.category,
        summary: g.description,
        recoveryTimeWeeks: g.recoveryTimeWeeks,
        delta: g.delta,
      }));
      const meta = {
        totalGoals: persistedGoals.length,
        highPriority: persistedGoals.filter((g) => g.priority === "High").length,
        mediumPriority: persistedGoals.filter((g) => g.priority === "Medium").length,
        lowPriority: persistedGoals.filter((g) => g.priority === "Low").length,
        source: "persisted",
        status: "approved",
      };
      return res.sendSuccess({ goals: summaryGoals, meta }, "Goals retrieved");
    }

    // Fallback: generate on-demand for users without persisted goals
    const { goals, meta } = await generateGoalCards(userId);
    const summaryGoals = goals.map((g) => ({
      goalId: g.goalId,
      title: g.title,
      priority: g.priority,
      healthImpact: g.healthImpact,
      category: g.category,
      summary: g.summary,
      recoveryTimeWeeks: g.recoveryTimeWeeks,
    }));
    res.sendSuccess({ goals: summaryGoals, meta }, "Goals retrieved");
  } catch (error) {
    if (error.code === "NO_REPORT") {
      return res.sendError("No report found. Upload a blood report first.", 404);
    }
    next(error);
  }
};

const getGoal = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { goalId } = req.params;

    const planStatus = await getApprovalStatus(userId);
    if (planStatus && planStatus !== "approved" && planStatus !== "ready") {
      return res.sendError("Goals are not yet approved by your doctor", 403);
    }

    const goal = await Goal.findOne({ userId, goalId, deletedByDoctor: { $ne: true } })
      .sort({ createdAt: -1 })
      .lean();

    if (goal) {
      return res.sendSuccess(goal, "Goal retrieved");
    }

    // Fallback: generate on-demand
    const { goals } = await generateGoalCards(userId);
    const found = goals.find((g) => g.goalId === goalId);
    if (!found) {
      return res.sendError("Goal not found", 404);
    }
    res.sendSuccess(found, "Goal retrieved");
  } catch (error) {
    if (error.code === "NO_REPORT") {
      return res.sendError("No report found", 404);
    }
    next(error);
  }
};

module.exports = { listGoals, getGoal };
