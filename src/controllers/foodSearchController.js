/**
 * Food Search Controller
 *
 * Thin wrapper over the provider-agnostic search service
 * (src/services/foodSearch). Response stays a plain array so the existing
 * frontend foodSearchAPI.search contract is unchanged.
 */
const { searchFoods: runSearch } = require("../services/foodSearch");
const { computeFoodScore, matchGI } = require("../services/foodScoringEngine");
const {
  ingredientStats,
  typicalFromEngine,
} = require("../services/foodInsights");

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

// ── POST /:userId/foods/insight ────────────────────────────────────

// Numeric fields accepted on the body; missing values default to 0.
const NUMERIC_FIELDS = [
  "grams",
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "fiberG",
  "sugarG",
];

/**
 * Deterministic insight for a single food item (draft-shaped, NOT
 * persisted): engine food score, fuzzy GI match, and community stats by
 * normalized name — with the engine "typical response" estimate as the
 * fallback when nobody else has logged it (same semantics as
 * getMealInsights ingredients). No DB writes, no AI.
 *
 * Body: { name, grams, calories, proteinG, carbsG, fatG, fiberG, sugarG }
 */
const itemInsight = async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return res.sendError("name is required.", 400);
    }
    if (name.length > 200) {
      return res.sendError("name too long.", 400);
    }

    // Single-item pseudo-meal: the item doubles as its own totals.
    const item = { name };
    for (const key of NUMERIC_FIELDS) {
      const v = body[key];
      if (v == null) {
        item[key] = 0;
        continue;
      }
      if (typeof v !== "number" || !Number.isFinite(v)) {
        return res.sendError(`${key} must be a number.`, 400);
      }
      item[key] = v;
    }

    const { score } = computeFoodScore([item], item);
    const gi = matchGI(name);

    // Same normalization Meal items.nameNorm uses (lowercase + trim).
    const stats = await ingredientStats(name.toLowerCase(), {
      excludeUserId: req.user.id,
    });
    const community = stats
      ? {
          count: stats.count,
          avgScore: stats.avgScore,
          avgDeltaMgDl: stats.avgDeltaMgDl,
        }
      : null;

    return res.sendSuccess(
      {
        foodScore: score,
        gi: gi ? { name: gi.name, gi: gi.gi, category: gi.category } : null,
        typical: community ? null : typicalFromEngine(item),
        community,
      },
      "Food insight computed"
    );
  } catch (err) {
    next(err);
  }
};

module.exports = { searchFoods, itemInsight };
