/**
 * lookup_food — agentic tool used during meal analysis.
 *
 * Searches the curated INDB/IFCT nutrition dataset (via the shared
 * foodSearch service, NOT a raw FoodItem query) for a recognized food and
 * returns a COMPACT candidate list. The meal-analyze model calls this per
 * recognized food and, when a candidate clearly matches, adopts the
 * candidate's per100g macros (scaled to its estimated grams) instead of
 * guessing.
 *
 * Tool-module contract mirrors src/tools/getMealData.js:
 *   module.exports = { definition: { name, description, input_schema }, execute(input, userId) }
 */
const { searchFoods } = require("../services/foodSearch");

const definition = {
  name: "lookup_food",
  description:
    "Look up curated Indian-nutrition dataset entries (INDB/IFCT) for a single recognized food by name. " +
    "Returns candidate foods, each with per-100g macros (calories, proteinG, carbsG, fatG, fiberG, sugarG), " +
    "a default serving, and common serving sizes. Call this once for EVERY distinct food you identify in a " +
    "meal (image or description). If a returned candidate clearly matches the food, adopt its per100g macros " +
    "scaled to your estimated grams. If nothing matches, estimate from your own knowledge.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "The food name or short phrase to match, e.g. 'roti', 'dal', 'buttermilk', 'paneer tikka'.",
      },
      max: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description: "Maximum candidates to return (default 5).",
      },
    },
    required: ["query"],
  },
};

const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10;

// Keep the payload small: at most a handful of servings, only the fields the
// model needs to scale macros.
function compactServings(servings) {
  if (!Array.isArray(servings)) return [];
  return servings.slice(0, 5).map((s) => ({
    label: s?.label ?? null,
    unit: s?.unit ?? null,
    grams: s?.grams != null ? round1(s.grams) : null,
  }));
}

async function execute(input = {}, userId) {
  try {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    if (!query) {
      return { candidates: [], message: "No query provided; estimate from your own knowledge." };
    }
    const max = Math.min(Math.max(parseInt(input.max, 10) || 5, 1), 10);

    // searchFoods returns { results, providers } — the local INDB/IFCT Mongo
    // provider runs first. We only surface the normalized candidate rows.
    const { results } = await searchFoods(query, { limit: max });

    if (!results || results.length === 0) {
      return {
        candidates: [],
        message: "No dataset match; estimate from your own knowledge.",
      };
    }

    const candidates = results.map((r) => {
      const p = r.per100g || {};
      const serving = r.portion || {};
      return {
        name: r.name,
        source: r.source, // "indb" | "ifct" | ...
        per100g: {
          calories: round1(p.calories),
          proteinG: round1(p.proteinG),
          carbsG: round1(p.carbsG),
          fatG: round1(p.fatG),
          fiberG: round1(p.fiberG),
          sugarG: round1(p.sugarG),
        },
        defaultServing: {
          unit: serving.unit ?? "g",
          grams: serving.grams != null ? round1(serving.grams) : null,
        },
        servings: compactServings(r.servings),
      };
    });

    return { candidates };
  } catch (err) {
    console.error(`[lookup_food] Lookup failed (query="${input?.query}"): ${err.message}`);
    // Never fail the tool call — the model should just fall back to its own
    // estimate when the dataset is unavailable.
    return { candidates: [], message: "Lookup failed; estimate from your own knowledge." };
  }
}

module.exports = { definition, execute };
