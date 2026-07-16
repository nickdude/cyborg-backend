/**
 * Glucose Insights Service
 *
 * Shared AI-backed "spiker + alternatives" analysis for a scored meal.
 * Used by the glucose day-review endpoint and the meal insights endpoint.
 * Gating (e.g. only analyzing meals with score <= 4) is the caller's
 * responsibility — this module always analyzes when asked.
 */

const MealScore = require("../models/MealScore");
const { getAnthropicClient, getModelName, extractJSON } = require("../providers/ai");
const { buildFoodAlternativesPrompt } = require("../prompts/foodAlternatives");

/**
 * Fetch AI-generated food alternatives for a meal.
 * Best-effort — returns the raw parsed JSON or null on failure.
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

/**
 * Return the cached glucoseAnalysis when present, otherwise generate it
 * via AI, persist it on the MealScore doc, and return it.
 * Best-effort — returns null on failure, never throws.
 *
 * @param {Object} meal      - Meal doc (lean ok): { _id, items, totals }
 * @param {Object} mealScore - MealScore doc (lean ok): { _id, foodScore, predictedGlucosePeak, glucoseAnalysis }
 * @returns {Promise<{spiker: string|null, spikerScore: number, alternatives: Array, explanation: string|null}|null>}
 */
async function ensureGlucoseAnalysis(meal, mealScore) {
  if (!mealScore) return null;

  // Cache hit — any completed analysis counts, including a spiker-less one
  // (analyzedAt marks completion). Checking spiker alone would make every
  // spiker-less meal a permanent cache miss that re-bills the AI per request.
  const cached = mealScore.glucoseAnalysis;
  if (cached && (cached.spiker || cached.analyzedAt)) {
    return cached;
  }

  const parsed = await fetchAlternatives(meal, mealScore);
  if (!parsed) return null;

  const analysis = {
    spiker: parsed.spiker?.name || null,
    spikerScore: mealScore.foodScore,
    alternatives: [
      ...(parsed.alternatives || []).map((a) => ({
        ...a,
        type: "alternative",
      })),
      ...(parsed.blunters || []).map((b) => ({
        ...b,
        type: "blunter",
      })),
    ],
    explanation: parsed.spiker?.explanation || null,
    analyzedAt: new Date(),
  };

  // Persist the analysis on the MealScore document for caching —
  // fire-and-forget, the response doesn't wait on it.
  MealScore.findByIdAndUpdate(mealScore._id, {
    $set: { glucoseAnalysis: analysis },
  }).catch((err) =>
    console.error(
      `[Glucose] Failed to cache analysis for score=${mealScore._id}: ${err.message}`
    )
  );

  return analysis;
}

module.exports = { ensureGlucoseAnalysis };
