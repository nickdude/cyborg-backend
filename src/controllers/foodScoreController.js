/**
 * Food Score Controller
 *
 * Endpoints for retrieving and computing meal food scores.
 */

const Meal = require("../models/Meal");
const MealScore = require("../models/MealScore");
const { computeFoodScore, computeAndSaveScore } = require("../services/foodScoringEngine");

// ── Helpers ─────────────────────────────────────────────────────────

function utcDayBounds(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// ── GET /:userId/meals/:mealId/score ────────────────────────────────

const getScore = async (req, res, next) => {
  try {
    const { mealId } = req.params;

    // Check for existing score
    let score = await MealScore.findOne({
      userId: req.user.id,
      mealId,
    }).lean();

    if (score) {
      return res.sendSuccess(score, "Meal score retrieved");
    }

    // No score yet — compute on-demand
    const meal = await Meal.findOne({
      _id: mealId,
      userId: req.user.id,
    }).lean();

    if (!meal) {
      return res.sendError("Meal not found.", 404);
    }

    // Compute and save (includes AI prediction)
    await computeAndSaveScore(meal);

    score = await MealScore.findOne({
      userId: req.user.id,
      mealId,
    }).lean();

    return res.sendSuccess(score, "Meal score computed");
  } catch (error) {
    next(error);
  }
};

// ── POST /:userId/meals/:mealId/score/compute ───────────────────────

const computeScore = async (req, res, next) => {
  try {
    const { mealId } = req.params;

    const meal = await Meal.findOne({
      _id: mealId,
      userId: req.user.id,
    }).lean();

    if (!meal) {
      return res.sendError("Meal not found.", 404);
    }

    // Force recompute
    await computeAndSaveScore(meal);

    const score = await MealScore.findOne({
      userId: req.user.id,
      mealId,
    }).lean();

    return res.sendSuccess(score, "Meal score recomputed");
  } catch (error) {
    next(error);
  }
};

// ── GET /:userId/meals/scores?date=YYYY-MM-DD ───────────────────────

const listScoresByDate = async (req, res, next) => {
  try {
    const bounds = utcDayBounds(req.query.date);
    if (!bounds) {
      return res.sendError("date must be YYYY-MM-DD", 400);
    }

    // Find meals for this day first
    const meals = await Meal.find({
      userId: req.user.id,
      consumedAt: { $gte: bounds.start, $lt: bounds.end },
    })
      .select("_id")
      .lean();

    const mealIds = meals.map((m) => m._id);

    if (mealIds.length === 0) {
      return res.sendSuccess([], "No meals found for this date");
    }

    const scores = await MealScore.find({
      userId: req.user.id,
      mealId: { $in: mealIds },
    })
      .sort({ computedAt: -1 })
      .lean();

    return res.sendSuccess(scores, "Meal scores retrieved");
  } catch (error) {
    next(error);
  }
};

module.exports = { getScore, computeScore, listScoresByDate };
