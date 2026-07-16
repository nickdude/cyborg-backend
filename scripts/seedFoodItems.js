/**
 * Seed script: loads the open Indian food datasets into the food_items
 * collection that powers /foods/search.
 *
 *   node scripts/seedFoodItems.js
 *
 * Data: scripts/data/indb/foods.json — pre-converted from
 *   - INDB (Indian Nutrient Databank, anuvaad.org.in): 1,014 cooked Indian
 *     recipes with per-100g nutrition + one common serving size.
 *   - IFCT 2017 (ICMR-NIN): 542 basic foods (fruits, grains, dairy…) with
 *     per-100g nutrition and regional-language aliases.
 *
 * Idempotent: upserts on {source, sourceId}, so re-runs refresh rows in
 * place and never duplicate. Existing `custom` rows are untouched.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const FoodItem = require("../src/models/FoodItem");

const FOODS = require("./data/indb/foods.json");

// Lowercased words from name + aliases; the multikey index over these powers
// prefix autocomplete. Parenthesised alt-names contribute tokens too:
// "Flattened rice (Poha)" → ["flattened", "rice", "poha"].
function tokensFor(entry) {
  const sources = [entry.name, ...(entry.aliases || [])];
  const tokens = new Set();
  for (const s of sources) {
    for (const t of String(s).toLowerCase().split(/[^a-z0-9]+/)) {
      if (t.length >= 2) tokens.add(t);
    }
  }
  return [...tokens];
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Seeding ${FOODS.length} food items…`);

  const ops = FOODS.map((entry) => ({
    updateOne: {
      filter: { source: entry.source, sourceId: entry.sourceId },
      update: {
        $set: {
          name: entry.name,
          nameNorm: entry.name.trim().toLowerCase(),
          searchTokens: tokensFor(entry),
          aliases: entry.aliases || [],
          kind: entry.kind || "food",
          foodGroup: entry.foodGroup || null,
          per100g: entry.per100g,
          servings: entry.servings || [],
          defaultServingIdx: 0,
        },
      },
      upsert: true,
    },
  }));

  const BATCH = 500;
  let upserted = 0;
  let modified = 0;
  for (let i = 0; i < ops.length; i += BATCH) {
    const res = await FoodItem.bulkWrite(ops.slice(i, i + BATCH), { ordered: false });
    upserted += res.upsertedCount || 0;
    modified += res.modifiedCount || 0;
    process.stdout.write(`  ${Math.min(i + BATCH, ops.length)}/${ops.length}\r`);
  }
  console.log(`\nUpserted ${upserted}, updated ${modified}.`);

  console.log("Syncing indexes…");
  await FoodItem.syncIndexes();

  const count = await FoodItem.countDocuments();
  console.log(`Done. food_items now holds ${count} rows.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
