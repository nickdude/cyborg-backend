/**
 * Glucose Controller
 *
 * Endpoints for glucose day-review and predicted glucose data.
 */

const Meal = require("../models/Meal");
const MealScore = require("../models/MealScore");
const { computeGlucoseScore } = require("../services/glucoseScoring");
const { ensureGlucoseAnalysis } = require("../services/glucoseInsights");

// ── Helpers ─────────────────────────────────────────────────────────

function utcDayBounds(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// ── GET /:userId/glucose/day-review?date=YYYY-MM-DD ─────────────────

const getDayReview = async (req, res, next) => {
  try {
    const bounds = utcDayBounds(req.query.date);
    if (!bounds) {
      return res.sendError("date must be YYYY-MM-DD", 400);
    }

    // Find meals for the day
    const meals = await Meal.find({
      userId: req.user.id,
      consumedAt: { $gte: bounds.start, $lt: bounds.end },
    })
      .sort({ consumedAt: 1 })
      .lean();

    if (meals.length === 0) {
      return res.sendSuccess(
        { date: req.query.date, meals: [], overallScore: null, insights: [] },
        "No meals found for this date"
      );
    }

    const mealIds = meals.map((m) => m._id);
    const scores = await MealScore.find({
      userId: req.user.id,
      mealId: { $in: mealIds },
    }).lean();

    // Index scores by mealId for quick lookup
    const scoreMap = {};
    for (const s of scores) {
      scoreMap[s.mealId.toString()] = s;
    }

    // Build per-meal review entries
    const mealReviews = [];
    let totalScore = 0;
    let scoredCount = 0;

    for (const meal of meals) {
      const mealScore = scoreMap[meal._id.toString()] || null;
      const entry = {
        meal: {
          _id: meal._id,
          title: meal.title,
          consumedAt: meal.consumedAt,
          totals: meal.totals,
          items: meal.items,
        },
        score: mealScore
          ? {
              foodScore: mealScore.foodScore,
              factors: mealScore.foodScoreFactors,
              predictedGlucosePeak: mealScore.predictedGlucosePeak,
            }
          : null,
        glucoseAnalysis: null,
      };

      if (mealScore) {
        totalScore += mealScore.foodScore;
        scoredCount++;

        // For meals with score <= 4, generate alternatives (best-effort).
        // ensureGlucoseAnalysis handles caching + persistence internally.
        if (mealScore.foodScore <= 4) {
          entry.glucoseAnalysis = await ensureGlucoseAnalysis(meal, mealScore);
        }
      }

      mealReviews.push(entry);
    }

    const overallScore =
      scoredCount > 0 ? Math.round(totalScore / scoredCount) : null;

    // Build insights
    const insights = [];
    if (overallScore !== null) {
      if (overallScore >= 8) {
        insights.push("Great day! Your meals had excellent nutritional quality.");
      } else if (overallScore >= 6) {
        insights.push("Good day overall. A few meals could use more fiber or protein.");
      } else if (overallScore >= 4) {
        insights.push(
          "Moderate day. Consider swapping high-GI foods for lower-GI alternatives."
        );
      } else {
        insights.push(
          "Tough day for glucose control. Several meals likely caused significant spikes."
        );
      }
    }

    const highGICount = mealReviews.filter(
      (m) => m.score && m.score.factors?.overallGI === "high"
    ).length;
    if (highGICount > 0) {
      insights.push(
        `${highGICount} meal${highGICount > 1 ? "s" : ""} had high glycemic index foods.`
      );
    }

    return res.sendSuccess(
      {
        date: req.query.date,
        meals: mealReviews,
        overallScore,
        insights,
      },
      "Day review retrieved"
    );
  } catch (error) {
    next(error);
  }
};

// ── GET /:userId/glucose/predictions?date=YYYY-MM-DD ────────────────

const getPredictions = async (req, res, next) => {
  try {
    const bounds = utcDayBounds(req.query.date);
    if (!bounds) {
      return res.sendError("date must be YYYY-MM-DD", 400);
    }

    // Find meals for the day
    const meals = await Meal.find({
      userId: req.user.id,
      consumedAt: { $gte: bounds.start, $lt: bounds.end },
    })
      .select("_id title consumedAt totals")
      .sort({ consumedAt: 1 })
      .lean();

    if (meals.length === 0) {
      return res.sendSuccess([], "No meals found for this date");
    }

    const mealIds = meals.map((m) => m._id);
    const scores = await MealScore.find({
      userId: req.user.id,
      mealId: { $in: mealIds },
    }).lean();

    const scoreMap = {};
    for (const s of scores) {
      scoreMap[s.mealId.toString()] = s;
    }

    const predictions = meals.map((meal) => {
      const mealScore = scoreMap[meal._id.toString()] || null;
      const prediction = mealScore?.predictedGlucosePeak || null;
      const glucoseScore = prediction
        ? computeGlucoseScore(prediction.deltaMgDl)
        : null;

      return {
        meal: {
          _id: meal._id,
          title: meal.title,
          consumedAt: meal.consumedAt,
          totals: meal.totals,
        },
        foodScore: mealScore?.foodScore || null,
        predictedGlucosePeak: prediction,
        glucoseScore,
      };
    });

    return res.sendSuccess(predictions, "Glucose predictions retrieved");
  } catch (error) {
    next(error);
  }
};

module.exports = { getDayReview, getPredictions };
