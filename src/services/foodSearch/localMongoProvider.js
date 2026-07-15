const FoodItem = require("../../models/FoodItem");

/**
 * Local Mongo food search over the seeded FoodItem collection.
 *
 * Pass 1 — prefix autocomplete: every query token must prefix-match some
 * searchToken (multikey index keeps the anchored regexes cheap). This is what
 * makes "pane" find "paneer" — $text can't prefix-match.
 * Pass 2 — $text relevance fallback for multi-word queries when pass 1 is thin.
 */

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

    return rank(docs, qNorm).slice(0, limit).map(toNormalized);
  },
};
