/**
 * Provider-agnostic food search.
 *
 * Provider contract:
 *   name: string
 *   isConfigured(): boolean
 *   search(q, { limit }): Promise<NormalizedFood[]>
 *
 * NormalizedFood (matches the Meal item schema + selection metadata):
 *   { refId, source, kind, name, portion:{quantity,unit,grams},
 *     calories, proteinG, carbsG, fatG, fiberG, sugarG,
 *     per100g?, servings? }   // extras power portion UIs; stripped on commit
 *
 * The local Mongo provider (seeded INDB + IFCT data) always runs first.
 * Remote providers only stack behind it when explicitly enabled, and their
 * calorie-less rows are dropped (a food you can't count is noise here).
 * The AI path is deliberately NOT a provider — its latency profile is wrong
 * for autocomplete; the frontend offers it as an explicit "describe it" step.
 */
const localMongo = require("./localMongoProvider");
const apiNinjas = require("./apiNinjasProvider");

const REMOTE_PROVIDERS = [apiNinjas];

async function searchFoods(q, { limit = 15 } = {}) {
  const results = await localMongo.search(q, { limit });
  const providers = [localMongo.name];

  if (results.length < limit) {
    for (const provider of REMOTE_PROVIDERS) {
      if (!provider.isConfigured()) continue;
      try {
        const remote = await provider.search(q, { limit: limit - results.length });
        const seen = new Set(results.map((r) => r.name.trim().toLowerCase()));
        for (const r of remote) {
          if (!r.calories) continue; // free tiers that hide calories
          const key = r.name.trim().toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          results.push(r);
        }
        providers.push(provider.name);
      } catch (err) {
        console.error(`[FoodSearch] ${provider.name} failed: ${err.message}`);
      }
    }
  }

  return { results: results.slice(0, limit), providers };
}

module.exports = { searchFoods };
