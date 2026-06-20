/**
 * Food Search Controller
 *
 * Searches the API Ninjas Nutrition API and maps results to the app's format.
 */

// ── GET /:userId/foods/search?q=watermelon ─────────────────────────

const searchFoods = async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.sendError("Query parameter 'q' is required.", 400);
    }

    const apiKey = process.env.API_NINJAS_KEY;
    if (!apiKey) {
      return res.sendError("Food search service is not configured.", 503);
    }

    const url = `https://api.api-ninjas.com/v1/nutrition?query=${encodeURIComponent(q.trim())}`;

    const response = await fetch(url, {
      headers: { "X-Api-Key": apiKey },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`API Ninjas error ${response.status}: ${text}`);
      return res.sendError("Food search failed. Please try again.", 502);
    }

    const raw = await response.json();

    const results = (Array.isArray(raw) ? raw : []).map((item) => ({
      name: item.name || "",
      portion: {
        quantity: 1,
        unit: "serving",
        grams: Math.round(item.serving_size_g || 0),
      },
      calories: Math.round(item.calories || 0),
      proteinG: Math.round(item.protein_g || 0),
      carbsG: Math.round(item.carbohydrates_total_g || 0),
      fatG: Math.round(item.fat_total_g || 0),
      fiberG: Math.round(item.fiber_g || 0),
      sugarG: Math.round(item.sugar_g || 0),
    }));

    return res.sendSuccess(results, "Food search results");
  } catch (err) {
    next(err);
  }
};

module.exports = { searchFoods };
