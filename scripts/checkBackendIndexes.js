/**
 * Verifies the NEW cluster has every index the backend code declares.
 *   node scripts/checkBackendIndexes.js
 *
 * Uses Mongoose diffIndexes(): toCreate = declared-in-schema-but-MISSING-in-db.
 * Also confirms the two Atlas vector-search indexes that $vectorSearch references.
 */
require("dotenv").config();
const path = require("path");
const mongoose = require("mongoose");

const MAIN = [
  "User", "ActionPlan", "Activity", "Chat", "GlucoseReading", "Goal",
  "Meal", "MealScore", "Notification", "OnboardingAnswer", "Questionnaire",
  "ReferralSource", "ReportData", "SchemaInfo", "Subscription", "WearableData",
];
const VEC = ["Memory", "ChatSummary", "CoreFact"];
// Names hardcoded in src/tools/*.js $vectorSearch stages.
const VECTOR_SEARCH = [
  { collection: "memories", name: "memoriesVector" },
  { collection: "chatsummaries", name: "chatSummaryVector" },
];

let missingTotal = 0;

async function diff(label, names) {
  for (const n of names) {
    const M = require(path.join(__dirname, "..", "src", "models", n));
    const d = await M.diffIndexes();
    const toCreate = d.toCreate || [];
    const toDrop = d.toDrop || [];
    missingTotal += toCreate.length;
    const status = toCreate.length ? `❌ MISSING ${toCreate.length}` : "✓ all present";
    let line = `  [${label}] ${n} -> ${M.collection.name}: ${status}`;
    if (toCreate.length) line += `\n        missing: ${JSON.stringify(toCreate)}`;
    if (toDrop.length) line += `\n        (extra in db, not declared: ${JSON.stringify(toDrop)})`;
    console.log(line);
  }
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  console.log(`\n=== normal db "${mongoose.connection.name}" — schema vs db ===`);
  await diff("main", MAIN);

  const { getVectorDb } = require("../src/config/vectorDb");
  const v = getVectorDb();
  await v.asPromise();
  console.log(`\n=== vector db "${v.name}" — schema vs db ===`);
  await diff("vector", VEC);

  console.log(`\n=== vector-search indexes referenced by code ===`);
  for (const { collection, name } of VECTOR_SEARCH) {
    let s = [];
    try { s = await v.db.collection(collection).listSearchIndexes().toArray(); } catch {}
    const hit = s.find((i) => i.name === name);
    if (hit && hit.queryable) console.log(`  ✓ ${name} on ${collection}: ${hit.status}/queryable`);
    else { console.log(`  ❌ ${name} on ${collection}: ${hit ? hit.status + " (not queryable yet)" : "NOT FOUND"}`); if (!hit) missingTotal++; }
  }

  console.log(`\n=== RESULT: ${missingTotal === 0 ? "✅ all backend-declared indexes are present" : "❌ " + missingTotal + " missing"} ===`);
  await mongoose.disconnect();
  await v.close();
  process.exit(missingTotal === 0 ? 0 : 1);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
