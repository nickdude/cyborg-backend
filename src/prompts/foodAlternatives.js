/**
 * Food Alternatives Prompt
 *
 * Instructs the AI to identify the worst glucose-spiking food in a meal
 * and suggest healthier alternatives or "blunters" (foods/additions that
 * reduce the glucose spike of the original food).
 */

/**
 * @param {Object} opts
 * @param {Array}  opts.items        - Meal items [{name, carbsG, sugarG, ...}]
 * @param {Object} opts.totals       - Meal totals
 * @param {Object} opts.prediction   - { deltaMgDl, peakMgDl, confidence }
 * @param {number} opts.foodScore    - Computed food score (1-10)
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
function buildFoodAlternativesPrompt({ items, totals, prediction, foodScore }) {
  const systemPrompt = `You are a clinical nutritionist specializing in glycemic management. Given a meal that caused a poor glucose response, identify the primary glucose-spiking food ("spiker") and suggest alternatives and blunting strategies.

Return ONLY raw JSON — no markdown fences, no commentary. Use this exact schema:

{
  "spiker": {
    "name": string,
    "explanation": string
  },
  "alternatives": [
    {
      "name": string,
      "description": string,
      "macros": {
        "calories": number,
        "proteinG": number,
        "carbsG": number,
        "fatG": number,
        "fiberG": number,
        "sugarG": number
      }
    }
  ],
  "blunters": [
    {
      "name": string,
      "description": string,
      "macros": {
        "calories": number,
        "proteinG": number,
        "carbsG": number,
        "fatG": number,
        "fiberG": number,
        "sugarG": number
      }
    }
  ]
}

Guidelines:
- "spiker": The single food item most responsible for the glucose spike. Explain why in 1-2 sentences (high GI, high sugar, refined carbs, etc).
- "alternatives": 2-3 lower-GI foods that could replace the spiker while keeping the meal satisfying. Include approximate macros per typical serving.
- "blunters": 2-3 foods or additions (e.g. vinegar, nuts, protein side) that could be eaten alongside the original meal to blunt the glucose spike. Explain the mechanism briefly in "description".
- Include both Indian and global options where relevant.
- All numeric fields must be real numbers.`;

  const itemList = items
    .map(
      (i) =>
        `- ${i.name}: ${i.carbsG || 0}g carbs, ${i.sugarG || 0}g sugar, ${i.fiberG || 0}g fiber, ${i.proteinG || 0}g protein, ${i.fatG || 0}g fat, ${i.calories || 0} cal`
    )
    .join("\n");

  const predictionStr = prediction
    ? `Predicted glucose spike: +${prediction.deltaMgDl || "?"}mg/dL (peak: ${prediction.peakMgDl || "?"}mg/dL, confidence: ${prediction.confidence || "medium"})`
    : "No glucose prediction available.";

  const userPrompt = `Analyze this meal (food score: ${foodScore}/10) and suggest alternatives:

Food items:
${itemList || "(no items)"}

Meal totals: ${totals.calories || 0} cal, ${totals.carbsG || 0}g carbs, ${totals.sugarG || 0}g sugar, ${totals.fiberG || 0}g fiber, ${totals.proteinG || 0}g protein, ${totals.fatG || 0}g fat

${predictionStr}`;

  return { systemPrompt, userPrompt };
}

module.exports = { buildFoodAlternativesPrompt };
