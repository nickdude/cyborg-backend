/**
 * Food Insights Service
 *
 * Shared deterministic helpers behind the meal-insights endpoint and the
 * single-food insight endpoint: community ingredient stats (one Mongo
 * aggregation over other users' scored meals, joined by normalized item
 * name) and the pure-engine "typical response" estimate used when nobody
 * has logged an ingredient yet. Pure engine + DB reads — no AI calls,
 * no writes.
 *
 * Extracted from mealController.getMealInsights so the food-search
 * insight endpoint can reuse the exact same logic.
 */

const mongoose = require("mongoose");

const Meal = require("../models/Meal");
const { computeFoodScore, matchGI } = require("./foodScoringEngine");

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Community stats for one ingredient: aggregate across OTHER users' logged
 * meals whose items include this (normalized) name, joined to their scores.
 * The requesting user's own meals are excluded so "community" data never
 * echoes their own log back at them. Returns null when no scored meals match.
 */
async function ingredientStats(normName, { excludeUserId } = {}) {
  const match = { "items.nameNorm": normName }; // indexed exact match
  if (excludeUserId) {
    match.userId = { $ne: new mongoose.Types.ObjectId(String(excludeUserId)) };
  }
  const rows = await Meal.aggregate([
    { $match: match },
    // Bound the join so a very common ingredient can't blow up the lookup.
    { $limit: 2000 },
    {
      $lookup: {
        from: "meal_scores",
        localField: "_id",
        foreignField: "mealId",
        as: "score",
      },
    },
    { $unwind: "$score" },
    {
      $project: {
        _id: 0,
        foodScore: "$score.foodScore",
        deltaMgDl: "$score.predictedGlucosePeak.deltaMgDl",
      },
    },
  ]);

  const scored = rows.filter((r) => typeof r.foodScore === "number");
  if (scored.length === 0) return null;

  // histogram[i] = count of meals with foodScore i+1
  const histogram = new Array(10).fill(0);
  let scoreSum = 0;
  let deltaSum = 0;
  let deltaCount = 0;
  for (const r of scored) {
    histogram[clamp(Math.round(r.foodScore), 1, 10) - 1]++;
    scoreSum += r.foodScore;
    if (typeof r.deltaMgDl === "number") {
      deltaSum += r.deltaMgDl;
      deltaCount++;
    }
  }

  return {
    count: scored.length,
    histogram,
    avgScore: Math.round((scoreSum / scored.length) * 10) / 10,
    avgDeltaMgDl:
      deltaCount > 0 ? Math.round((deltaSum / deltaCount) * 10) / 10 : null,
  };
}

// Deterministic engine estimate for an ingredient nobody has logged yet —
// NOT community data; the frontend labels it via source: "engine".
function typicalFromEngine(item) {
  // The item carries its own macro fields, so it doubles as its totals.
  const { score: engineScore } = computeFoodScore([item], item);

  const gi = matchGI(item.name);
  const carbsG = item.carbsG || 0;
  // Distrust a near-zero glycemic load on a carb-heavy item — the fuzzy GI
  // matcher can hit the protein word of a composite dish ("Mutton biryani"
  // → mutton, GI 0) and zero out the whole estimate.
  const gl = gi ? (gi.gi * carbsG) / 100 : 0;
  let deltaMgDl;
  if (gi && !(gl < 1 && carbsG >= 15)) {
    deltaMgDl = clamp(Math.round(3 * gl), 5, 80);
  } else {
    const netCarbsG = Math.max(0, carbsG - (item.fiberG || 0));
    deltaMgDl = clamp(
      Math.round(((item.sugarG || 0) * 1.5 + netCarbsG) * 1.2),
      5,
      80
    );
  }

  // Keep score and delta coherent: a big estimated rise can't coexist with a
  // near-perfect score (the same bogus GI match inflates the engine score).
  const score = Math.min(engineScore, 10 - Math.floor(deltaMgDl / 12));

  return { score, deltaMgDl, source: "engine" };
}

module.exports = { ingredientStats, typicalFromEngine };
