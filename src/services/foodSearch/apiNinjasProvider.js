/**
 * API Ninjas Nutrition provider — the previous foodSearchController
 * implementation moved behind the provider contract.
 *
 * DISABLED BY DEFAULT: the free tier stopped returning `calories` and
 * `protein_g` (premium-only fields), which makes results useless for
 * logging. Enable by setting FOOD_SEARCH_STACK_REMOTE=true alongside a
 * paid API_NINJAS_KEY.
 */
module.exports = {
  name: "apiNinjas",

  isConfigured() {
    return (
      Boolean(process.env.API_NINJAS_KEY) &&
      process.env.FOOD_SEARCH_STACK_REMOTE === "true"
    );
  },

  async search(q, { limit = 15 } = {}) {
    const url = `https://api.api-ninjas.com/v1/nutrition?query=${encodeURIComponent(q.trim())}`;
    const response = await fetch(url, {
      headers: { "X-Api-Key": process.env.API_NINJAS_KEY },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`API Ninjas error ${response.status}: ${text.slice(0, 200)}`);
    }
    const raw = await response.json();
    return (Array.isArray(raw) ? raw : [])
      .slice(0, limit)
      .map((item) => ({
        refId: null,
        source: "apiNinjas",
        kind: "food",
        name: item.name || "",
        portion: {
          quantity: 1,
          unit: "serving",
          grams: Math.round(item.serving_size_g || 0) || null,
        },
        calories: Math.round(Number(item.calories) || 0),
        proteinG: Math.round(Number(item.protein_g) || 0),
        carbsG: Math.round(Number(item.carbohydrates_total_g) || 0),
        fatG: Math.round(Number(item.fat_total_g) || 0),
        fiberG: Math.round(Number(item.fiber_g) || 0),
        sugarG: Math.round(Number(item.sugar_g) || 0),
      }));
  },
};
