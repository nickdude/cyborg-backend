const { generateGoalCards } = require("../services/goalsEngine");

const listGoals = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { goals, meta } = await generateGoalCards(userId);
    // Return summary view (without full narrative details)
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
    const { goals } = await generateGoalCards(userId);
    const goal = goals.find((g) => g.goalId === goalId);
    if (!goal) {
      return res.sendError("Goal not found", 404);
    }
    res.sendSuccess(goal, "Goal retrieved");
  } catch (error) {
    if (error.code === "NO_REPORT") {
      return res.sendError("No report found", 404);
    }
    next(error);
  }
};

module.exports = { listGoals, getGoal };
