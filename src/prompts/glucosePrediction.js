/**
 * Glucose Prediction Prompt
 *
 * Instructs the AI to predict the blood glucose response from a meal's
 * food items and macronutrient profile. Returns structured JSON.
 */

/**
 * @param {Object} opts
 * @param {Array}  opts.items   - Meal items [{name, portion, carbsG, fiberG, fatG, proteinG, sugarG, calories}]
 * @param {Object} opts.totals  - {calories, proteinG, carbsG, fatG, fiberG, sugarG}
 * @param {number} opts.foodScore - Computed food score (1-10)
 * @param {Object} opts.factors  - Food score factor breakdown
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
function buildGlucosePredictionPrompt({ items, totals, foodScore, factors }) {
  const systemPrompt = `You are a clinical nutrition and glucose metabolism expert. Given a meal's food items and macronutrient breakdown, predict the likely postprandial (post-meal) blood glucose response for a healthy adult without diabetes.

Your prediction should factor in:
- Glycemic index and glycemic load of the foods
- Fiber content (slows glucose absorption)
- Protein and fat content (blunt glucose spikes)
- Sugar content (rapid glucose elevation)
- Food combinations and their synergistic effects
- Typical portion sizes and carbohydrate density

Return ONLY raw JSON — no markdown fences, no commentary. Use this exact schema:

{
  "predictedPeakDelta": number,
  "predictedBaseline": number,
  "predictedPeakMgDl": number,
  "confidence": "low" | "medium" | "high",
  "rationale": string
}

Field definitions:
- "predictedPeakDelta": Expected rise in blood glucose (mg/dL) above baseline. Typical range: 5-80 mg/dL for healthy individuals.
- "predictedBaseline": Assumed fasting baseline glucose (mg/dL). Use 90 for a healthy adult unless context suggests otherwise.
- "predictedPeakMgDl": predictedBaseline + predictedPeakDelta.
- "confidence": "high" if the meal contains well-studied foods with clear carb content, "medium" for mixed meals, "low" if items are ambiguous or unusual.
- "rationale": One sentence explaining the key driver of the glucose response (max 150 chars).

All numeric fields must be real numbers, not strings.`;

  const itemList = items
    .map(
      (i) =>
        `- ${i.name}: ${i.carbsG || 0}g carbs, ${i.fiberG || 0}g fiber, ${i.proteinG || 0}g protein, ${i.fatG || 0}g fat, ${i.sugarG || 0}g sugar`
    )
    .join("\n");

  const userPrompt = `Predict the glucose response for this meal:

Food items:
${itemList || "(no individual items available)"}

Meal totals:
- Calories: ${totals.calories || 0}
- Carbs: ${totals.carbsG || 0}g
- Fiber: ${totals.fiberG || 0}g
- Protein: ${totals.proteinG || 0}g
- Fat: ${totals.fatG || 0}g
- Sugar: ${totals.sugarG || 0}g

Computed food score: ${foodScore}/10 (glycemic load factor: ${factors?.overallGI || "unknown"})`;

  return { systemPrompt, userPrompt };
}

module.exports = { buildGlucosePredictionPrompt };
