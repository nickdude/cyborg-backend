/**
 * Post-Workout Analysis Prompt
 *
 * Instructs the AI to recommend foods and provide insights after a
 * workout session, considering the type, duration, intensity, and
 * the user's goals.
 */

/**
 * @param {Object} opts
 * @param {string} opts.activityName   - Name of the workout (e.g. "Running")
 * @param {number} opts.durationMin    - Duration in minutes
 * @param {string} opts.intensity      - "low" | "moderate" | "high"
 * @param {number} opts.caloriesBurned - Estimated calories burned
 * @param {Object} [opts.userProfile]  - Optional: { weightKg, goals, dietaryPreferences }
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
function buildPostWorkoutPrompt({ activityName, durationMin, intensity, caloriesBurned, userProfile }) {
  const systemPrompt = `You are a sports nutrition expert. Given workout details, recommend optimal post-workout foods and provide actionable recovery insights.

Return ONLY raw JSON — no markdown fences, no commentary. Use this exact schema:

{
  "foodRecommendations": [
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
      },
      "dietTags": [string],
      "rationale": string
    }
  ],
  "insights": [string],
  "recommendations": [string]
}

Guidelines:
- Provide 3-5 food recommendations ranked by suitability.
- "dietTags" should include relevant labels like "high-protein", "low-gi", "vegan", "indian", "quick-prep", etc.
- "insights" should include 2-3 evidence-based insights about recovery nutrition for this workout type.
- "recommendations" should include 2-3 practical tips (timing, hydration, what to avoid).
- Include both Indian and global food options where relevant.
- Consider the anabolic window (30-60 minutes post-workout).
- Prioritize protein for muscle repair and moderate carbs for glycogen replenishment.
- All numeric fields must be real numbers.`;

  const profile = userProfile
    ? `\nUser context: weight ${userProfile.weightKg || "unknown"}kg, goals: ${userProfile.goals || "general fitness"}, diet: ${userProfile.dietaryPreferences || "no restrictions"}`
    : "";

  const userPrompt = `Recommend post-workout nutrition for this session:

Workout: ${activityName || "General exercise"}
Duration: ${durationMin || 0} minutes
Intensity: ${intensity || "moderate"}
Calories burned: ${caloriesBurned || 0} kcal${profile}`;

  return { systemPrompt, userPrompt };
}

module.exports = { buildPostWorkoutPrompt };
