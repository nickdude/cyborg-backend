const FoodItem = require("../../models/FoodItem");
const { tokenize, bestFuzzyScore } = require("../../utils/fuzzy");

/**
 * Local Mongo food search over the seeded FoodItem collection.
 *
 * Pass 1 — prefix autocomplete: every query token must prefix-match some
 * searchToken (multikey index keeps the anchored regexes cheap). This is what
 * makes "pane" find "paneer" — $text can't prefix-match.
 * Pass 2 — $text relevance fallback for multi-word queries when pass 1 is thin.
 * Pass 3 — in-memory fuzzy fallback for typos ("panner" → "Paneer"): scores
 * the query against a cached name/alias list and appends the survivors after
 * the exact matches.
 */

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const FUZZY_THRESHOLD = 0.72;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Cached {id, popularity, candidates: [[token,...], ...]} rows for the fuzzy
// pass. ~1.5k rows ≈ a few hundred KB; refreshed lazily so seed runs show up.
let fuzzyCache = null;
let fuzzyCacheAt = 0;
async function getFuzzyCache() {
  if (fuzzyCache && Date.now() - fuzzyCacheAt < CACHE_TTL_MS) return fuzzyCache;
  const rows = await FoodItem.find(
    {},
    { name: 1, nameNorm: 1, aliases: 1, popularity: 1 }
  ).lean();
  fuzzyCache = rows.map((r) => ({
    id: String(r._id),
    popularity: r.popularity || 0,
    candidates: [r.nameNorm || r.name, ...(r.aliases || [])]
      .map(tokenize)
      .filter((t) => t.length > 0),
  }));
  fuzzyCacheAt = Date.now();
  return fuzzyCache;
}

function toNormalized(doc) {
  const serving =
    doc.servings?.[doc.defaultServingIdx] || doc.servings?.[0] || {
      label: "100 g",
      unit: "g",
      grams: 100,
    };
  const factor = (serving.grams || 100) / 100;
  const r1 = (v) => Math.round((Number(v) || 0) * factor * 10) / 10;
  return {
    refId: String(doc._id),
    source: doc.source,
    kind: doc.kind,
    name: doc.name,
    portion: { quantity: 1, unit: serving.unit, grams: serving.grams },
    calories: r1(doc.per100g?.calories),
    proteinG: r1(doc.per100g?.proteinG),
    carbsG: r1(doc.per100g?.carbsG),
    fatG: r1(doc.per100g?.fatG),
    fiberG: r1(doc.per100g?.fiberG),
    sugarG: r1(doc.per100g?.sugarG),
    per100g: doc.per100g,
    servings: doc.servings,
  };
}

// Rank: exact name-prefix matches first, then simple foods before composite
// recipes, then popularity, then shorter (more specific) names.
function rank(docs, qNorm) {
  return docs.sort((a, b) => {
    const aPrefix = a.nameNorm.startsWith(qNorm) ? 0 : 1;
    const bPrefix = b.nameNorm.startsWith(qNorm) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    if (a.kind !== b.kind) return a.kind === "food" ? -1 : 1;
    if ((b.popularity || 0) !== (a.popularity || 0)) return (b.popularity || 0) - (a.popularity || 0);
    return a.name.length - b.name.length;
  });
}

module.exports = {
  name: "localMongo",

  isConfigured() {
    return true;
  },

  async search(q, { limit = 15 } = {}) {
    const qNorm = q.trim().toLowerCase();
    const tokens = qNorm.split(/[^a-z0-9]+/).filter(Boolean);
    if (tokens.length === 0) return [];

    // Pass 1: prefix match — every token must prefix some searchToken.
    const prefixQuery = {
      $and: tokens.map((t) => ({ searchTokens: { $regex: `^${escapeRegex(t)}` } })),
    };
    let docs = await FoodItem.find(prefixQuery).limit(limit * 3).lean();

    // Pass 2: text-relevance fallback when prefix matching comes up short.
    if (docs.length < limit && tokens.length >= 2) {
      const textDocs = await FoodItem.find(
        { $text: { $search: qNorm } },
        { score: { $meta: "textScore" } }
      )
        .sort({ score: { $meta: "textScore" } })
        .limit(limit * 2)
        .lean();
      const seen = new Set(docs.map((d) => String(d._id)));
      for (const d of textDocs) {
        if (!seen.has(String(d._id))) docs.push(d);
      }
    }

    // Pass 3: fuzzy typo fallback. Kept out of `docs` so exact matches always
    // rank ahead of guesses; within the fuzzy set, best score wins.
    let fuzzyDocs = [];
    if (docs.length < limit) {
      const cache = await getFuzzyCache();
      const seen = new Set(docs.map((d) => String(d._id)));
      const scored = [];
      for (const row of cache) {
        if (seen.has(row.id)) continue;
        const score = bestFuzzyScore(tokens, row.candidates);
        if (score >= FUZZY_THRESHOLD) scored.push({ row, score });
      }
      scored.sort(
        (a, b) => b.score - a.score || b.row.popularity - a.row.popularity
      );
      const ids = scored.slice(0, limit - docs.length).map((s) => s.row.id);
      if (ids.length) {
        const found = await FoodItem.find({ _id: { $in: ids } }).lean();
        const order = new Map(ids.map((id, i) => [id, i]));
        fuzzyDocs = found.sort(
          (a, b) => order.get(String(a._id)) - order.get(String(b._id))
        );
      }
    }

    return rank(docs, qNorm)
      .concat(fuzzyDocs)
      .slice(0, limit)
      .map(toNormalized);
  },
};
