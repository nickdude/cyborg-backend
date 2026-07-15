/**
 * Food Search Controller
 *
 * Thin wrapper over the provider-agnostic search service
 * (src/services/foodSearch). Response stays a plain array so the existing
 * frontend foodSearchAPI.search contract is unchanged.
 */
const { searchFoods: runSearch } = require("../services/foodSearch");

// ── GET /:userId/foods/search?q=paneer&limit=15 ────────────────────

const searchFoods = async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) {
      return res.sendError("Query parameter 'q' is required.", 400);
    }
    if (q.length > 100) {
      return res.sendError("Query too long.", 400);
    }
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(30, Math.max(1, rawLimit)) : 15;

    const { results } = await runSearch(q, { limit });
    return res.sendSuccess(results, "Food search results");
  } catch (err) {
    next(err);
  }
};

module.exports = { searchFoods };
