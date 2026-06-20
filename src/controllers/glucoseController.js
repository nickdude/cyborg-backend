/**
 * Glucose Controller
 *
 * Endpoints for glucose day-review and predicted glucose data.
 */

const Meal = require("../models/Meal");
const MealScore = require("../models/MealScore");
const { computeGlucoseScore } = require("../services/glucoseScoring");
const { getAnthropicClient, getModelName, extractJSON } = require("../providers/ai");
const { buildFoodAlternativesPrompt } = require("../prompts/foodAlternatives");

// ── Helpers ─────────────────────────────────────────────────────────

function utcDayBounds(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Fetch AI-generated food alternatives for a meal with a poor score.
 * Best-effort — returns null on failure.
 */
async function fetchAlternatives(meal, mealScore) {
  try {
    const client = getAnthropicClient();
    const model = getModelName();

    const { systemPrompt, userPrompt } = buildFoodAlternativesPrompt({
      items: meal.items || [],
      totals: meal.totals || {},
      prediction: mealScore.predictedGlucosePeak || null,
      foodScore: mealScore.foodScore,
    });

    const stream = client.messages.stream({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
    });
    const response = await stream.finalMessage();
    const textBlock = response.content?.find((b) => b.type === "text");
    const raw = textBlock?.text || "";
    const parsed = extractJSON(raw);
    return parsed || null;
  } catch (err) {
    console.error(`[Glucose] AI alternatives failed meal=${meal._id}: ${err.message}`);
    return null;
  }
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

        // For meals with score <= 4, generate alternatives (best-effort)
        if (mealScore.foodScore <= 4) {
          // Use cached analysis if available
          if (
            mealScore.glucoseAnalysis &&
            mealScore.glucoseAnalysis.spiker
          ) {
            entry.glucoseAnalysis = mealScore.glucoseAnalysis;
          } else {
            const analysis = await fetchAlternatives(meal, mealScore);
            if (analysis) {
              entry.glucoseAnalysis = {
                spiker: analysis.spiker?.name || null,
                spikerScore: mealScore.foodScore,
                alternatives: [
                  ...(analysis.alternatives || []).map((a) => ({
                    ...a,
                    type: "alternative",
                  })),
                  ...(analysis.blunters || []).map((b) => ({
                    ...b,
                    type: "blunter",
                  })),
                ],
                explanation: analysis.spiker?.explanation || null,
              };

              // Persist the analysis on the MealScore document for caching
              MealScore.findByIdAndUpdate(mealScore._id, {
                $set: { glucoseAnalysis: entry.glucoseAnalysis },
              }).catch((err) =>
                console.error(
                  `[Glucose] Failed to cache analysis for score=${mealScore._id}: ${err.message}`
                )
              );
            }
          }
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
