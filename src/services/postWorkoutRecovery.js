/**
 * Post-Workout Recovery Service
 *
 * AI-backed recovery analysis for a logged activity: food recommendations,
 * recovery insights, and practical tips. Builds the prompt from
 * prompts/postWorkoutAnalysis.js (whose JSON schema is the source of truth
 * for field names), calls the configured AI provider, and validates the
 * response. Caching on the Activity document is the controller's concern.
 *
 * Throws on AI/parse/validation failure — the controller maps that to 502.
 */

const { generateText, extractJSON } = require("../providers/ai");
const { buildPostWorkoutPrompt } = require("../prompts/postWorkoutAnalysis");

/**
 * The Activity model doesn't store intensity, so derive a coarse
 * low/moderate/high label from calories-per-minute (rough MET proxy).
 */
function deriveIntensity(activity) {
  const mins = Number(activity.durationMinutes) || 0;
  const kcal = Number(activity.caloriesBurned) || 0;
  if (!mins || !kcal) return "moderate";
  const kcalPerMin = kcal / mins;
  if (kcalPerMin < 4) return "low";
  if (kcalPerMin > 8) return "high";
  return "moderate";
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v) => (typeof v === "string" ? v.trim() : "");

function normalizeFoodRec(rec) {
  if (!rec || typeof rec !== "object") return null;
  const name = str(rec.name);
  if (!name) return null;
  const macros = rec.macros && typeof rec.macros === "object" ? rec.macros : {};
  return {
    name,
    description: str(rec.description),
    macros: {
      calories: num(macros.calories),
      proteinG: num(macros.proteinG),
      carbsG: num(macros.carbsG),
      fatG: num(macros.fatG),
      fiberG: num(macros.fiberG),
      sugarG: num(macros.sugarG),
    },
    dietTags: Array.isArray(rec.dietTags)
      ? rec.dietTags.map(str).filter(Boolean).map((t) => t.toLowerCase())
      : [],
    rationale: str(rec.rationale),
  };
}

const toStringList = (arr) =>
  Array.isArray(arr) ? arr.map(str).filter(Boolean) : [];

/**
 * Validate + normalize the parsed LLM JSON into the schema the prompt
 * specifies. Throws when the response is unusable.
 */
function normalizeAnalysis(parsed) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI response is not a JSON object");
  }
  const foodRecommendations = (Array.isArray(parsed.foodRecommendations)
    ? parsed.foodRecommendations
    : []
  )
    .map(normalizeFoodRec)
    .filter(Boolean);
  const insights = toStringList(parsed.insights);
  const recommendations = toStringList(parsed.recommendations);

  if (foodRecommendations.length === 0) {
    throw new Error("AI response has no usable foodRecommendations");
  }
  if (insights.length === 0 && recommendations.length === 0) {
    throw new Error("AI response has no insights or recommendations");
  }
  return { foodRecommendations, insights, recommendations };
}

/**
 * Generate a recovery analysis for an activity.
 *
 * @param {Object} activity - Activity doc (lean ok): name, durationMinutes,
 *                            caloriesBurned, startTime
 * @param {Object} [user]   - User doc (lean ok): firstName
 * @returns {Promise<{foodRecommendations: Array, insights: string[], recommendations: string[]}>}
 */
async function generateRecoveryAnalysis(activity, user) {
  const { systemPrompt, userPrompt } = buildPostWorkoutPrompt({
    activityName: activity.name,
    durationMin: activity.durationMinutes,
    intensity: deriveIntensity(activity),
    caloriesBurned: activity.caloriesBurned || 0,
  });

  // Extra context the prompt builder doesn't parameterize: who worked out
  // and when (meal suggestions differ for a 7am run vs a 9pm lift).
  const contextLines = [];
  const firstName = str(user && user.firstName);
  if (firstName) contextLines.push(`User first name: ${firstName}`);
  if (activity.startTime) {
    contextLines.push(
      `Workout start time: ${new Date(activity.startTime).toISOString()}`
    );
  }
  const fullUserPrompt = contextLines.length
    ? `${userPrompt}\n${contextLines.join("\n")}`
    : userPrompt;

  const raw = await generateText({
    systemPrompt,
    userPrompt: fullUserPrompt,
    maxTokens: 3000,
  });

  return normalizeAnalysis(extractJSON(raw));
}

module.exports = { generateRecoveryAnalysis };
