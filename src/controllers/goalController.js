const Goal = require("../models/Goal");
const { generateGoalCards } = require("../services/goalsEngine");

const listGoals = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Read from persisted goals (latest report's goals)
    const persistedGoals = await Goal.find({ userId })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    if (persistedGoals.length > 0) {
      const summaryGoals = persistedGoals.map((g) => ({
        goalId: g.goalId,
        title: g.title,
        priority: g.priority,
        healthImpact: g.healthImpact,
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

    // Read from persisted goals first
    const goal = await Goal.findOne({ userId, goalId })
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
