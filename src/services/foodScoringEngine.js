/**
 * Food Scoring Engine
 *
 * Pure computation module that scores a meal's nutritional quality on a
 * 1-10 scale based on glycemic load, fiber, protein, sugar, and fat
 * composition. Also provides a background-safe wrapper that fetches the
 * meal, computes the score, calls AI for glucose prediction, and saves
 * the result.
 */

const giData = require("../data/glycemicIndex");

// ── Fuzzy GI lookup ─────────────────────────────────────────────────

/**
 * Attempt to match a meal item name to a GI entry. Uses case-insensitive
 * word-boundary-aware matching — e.g. "grilled chicken breast" matches
 * "chicken breast". Prioritises exact matches, then "item contains entry"
 * (longest wins), then "entry contains item" as a last resort.
 */
function matchGI(itemName) {
  const lower = (itemName || "").toLowerCase().trim();
  if (!lower) return null;

  // Split into words for word-boundary matching
  const words = lower.split(/\s+/);

  let bestExact = null;      // exact string match
  let bestContains = null;   // item name contains the GI entry name (longest wins)
  let bestReverse = null;    // GI entry name contains the item name (longest entry wins)

  for (const entry of giData) {
    if (lower === entry.name) {
      bestExact = entry;
      break; // can't do better than exact
    }

    // Check if the item name contains the full entry name as a word boundary
    // e.g. "grilled chicken breast" contains "chicken breast"
    if (lower.includes(entry.name)) {
      if (!bestContains || entry.name.length > bestContains.name.length) {
        bestContains = entry;
      }
    }

    // Reverse: entry name contains the item as a whole word
    // e.g. entry "chicken breast" contains item "chicken"
    // Only use word-boundary match to avoid "cola" matching "chocolate"
    const entryWords = entry.name.split(/\s+/);
    const itemWordsInEntry = words.every((w) => entryWords.includes(w));
    if (itemWordsInEntry && words.length > 0) {
      if (!bestReverse || entry.name.length > bestReverse.name.length) {
        bestReverse = entry;
      }
    }
  }

  return bestExact || bestContains || bestReverse || null;
}

// ── Sub-score functions ─────────────────────────────────────────────

function scoreGlycemicLoad(items) {
  let totalGL = 0;
  let matchedGIs = [];

  for (const item of items) {
    const match = matchGI(item.name);
    if (match) {
      matchedGIs.push(match.gi);
      const carbsG = item.carbsG || 0;
      const gl = (match.gi * carbsG) / 100;
      totalGL += gl;
    }
  }

  let score;
  if (totalGL < 10) score = 10;
  else if (totalGL < 20) score = 7;
  else if (totalGL < 30) score = 5;
  else if (totalGL < 40) score = 3;
  else score = 1;

  // Determine overall GI from average of matched foods
  let overallGI = "medium";
  if (matchedGIs.length > 0) {
    const avgGI = matchedGIs.reduce((a, b) => a + b, 0) / matchedGIs.length;
    if (avgGI < 55) overallGI = "low";
    else if (avgGI < 70) overallGI = "medium";
    else overallGI = "high";
  }

  return { score, overallGI };
}

function scoreFiberRatio(totals) {
  const fiberG = totals.fiberG || 0;
  const sugarG = Math.max(totals.sugarG || 0, 1);
  const ratio = fiberG / sugarG;

  if (ratio > 0.5) return 10;
  if (ratio >= 0.3) return 7;
  if (ratio >= 0.1) return 4;
  return 2;
}

function scoreProteinPresence(totals) {
  const calories = Math.max(totals.calories || 0, 1);
  const proteinCals = (totals.proteinG || 0) * 4;
  const pct = (proteinCals / calories) * 100;

  if (pct > 25) return 10;
  if (pct >= 15) return 7;
  if (pct >= 5) return 4;
  return 2;
}

function scoreSugarDensity(totals) {
  const calories = Math.max(totals.calories || 0, 1);
  const sugarCals = (totals.sugarG || 0) * 4;
  const pct = (sugarCals / calories) * 100;

  if (pct < 10) return 10;
  if (pct < 25) return 7;
  if (pct < 40) return 4;
  return 1;
}

function scoreFatModulation(totals) {
  const fatG = totals.fatG || 0;
  const calories = Math.max(totals.calories || 0, 1);
  const maxHealthyFat = 0.5 * (calories / 9);
  const isHealthy = fatG > 5 && fatG < maxHealthyFat;
  return isHealthy ? 8 : 5;
}

// ── Main scoring function ───────────────────────────────────────────

/**
 * Compute a food score (1-10) for a meal.
 *
 * @param {Array}  items  - Meal items array [{name, carbsG, ...}]
 * @param {Object} totals - Aggregated meal totals {calories, proteinG, carbsG, fatG, fiberG, sugarG}
 * @returns {{ score: number, factors: Object }}
 */
function computeFoodScore(items, totals) {
  const glResult = scoreGlycemicLoad(items);
  const fiber = scoreFiberRatio(totals);
  const protein = scoreProteinPresence(totals);
  const sugar = scoreSugarDensity(totals);
  const fat = scoreFatModulation(totals);

  const weightedSum =
    glResult.score * 0.35 +
    fiber * 0.20 +
    protein * 0.20 +
    sugar * 0.15 +
    fat * 0.10;

  const score = Math.max(1, Math.min(10, Math.round(weightedSum)));

  return {
    score,
    factors: {
      glycemicLoadScore: glResult.score,
      fiberRatio: fiber,
      proteinPresence: protein,
      sugarDensity: sugar,
      fatModulation: fat,
      overallGI: glResult.overallGI,
    },
  };
}

// ── Background compute-and-save wrapper ─────────────────────────────

/**
 * Compute food score + AI glucose prediction for a meal, then save as
 * a MealScore document. Intended for fire-and-forget use after meal
 * creation.
 *
 * @param {Object} meal - Mongoose Meal document (or plain object with _id, userId, items, totals)
 */
async function computeAndSaveScore(meal) {
  const MealScore = require("../models/MealScore");
  const { getAnthropicClient, getModelName, extractJSON } = require("../providers/ai");
  const { buildGlucosePredictionPrompt } = require("../prompts/glucosePrediction");

  const { score, factors } = computeFoodScore(meal.items || [], meal.totals || {});

  // Best-effort AI glucose prediction
  let prediction = null;
  let modelUsed = "";
  try {
    const client = getAnthropicClient();
    const model = getModelName();
    modelUsed = model;

    const { systemPrompt, userPrompt } = buildGlucosePredictionPrompt({
      items: meal.items || [],
      totals: meal.totals || {},
      foodScore: score,
      factors,
    });

    const stream = client.messages.stream({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
    });
    const response = await stream.finalMessage();
    const textBlock = response.content?.find((b) => b.type === "text");
    const raw = textBlock?.text || "";
    const parsed = extractJSON(raw);

    if (parsed && typeof parsed.predictedPeakDelta === "number") {
      prediction = {
        deltaMgDl: parsed.predictedPeakDelta,
        peakMgDl: parsed.predictedPeakMgDl || (90 + parsed.predictedPeakDelta),
        baselineMgDl: parsed.predictedBaseline || 90,
        confidence: parsed.confidence || "medium",
      };
    }
  } catch (aiErr) {
    console.error(
      `[FoodScore] AI glucose prediction failed meal=${meal._id}: ${aiErr.message}`
    );
  }

  const doc = {
    userId: meal.userId,
    mealId: meal._id,
    foodScore: score,
    foodScoreFactors: factors,
    modelUsed,
    computedAt: new Date(),
  };

  if (prediction) {
    doc.predictedGlucosePeak = prediction;
  }

  await MealScore.findOneAndUpdate(
    { userId: meal.userId, mealId: meal._id },
    { $set: doc },
    { upsert: true, new: true }
  );

  console.log(
    `[FoodScore] Scored meal=${meal._id} score=${score} prediction=${prediction ? prediction.deltaMgDl + "mg/dL" : "none"}`
  );
}

module.exports = { computeFoodScore, computeAndSaveScore, matchGI };
