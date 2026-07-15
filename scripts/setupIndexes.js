/**
 * One-shot index bootstrap for a fresh cluster.
 *
 *   node scripts/setupIndexes.js
 *
 * Does NOT migrate data. It only:
 *   1. Connects to MONGO_URI (normal db) and runs syncIndexes() on every main model.
 *   2. Connects to VECTOR_DB_URI (vector db) and runs syncIndexes() on the
 *      vector-connection models (Memory, ChatSummary, CoreFact).
 *   3. Creates the Atlas Vector Search indexes that $vectorSearch needs
 *      (these are NOT Mongoose indexes and are not created by syncIndexes):
 *        - memoriesVector      on memories.embedding
 *            vector(3072, cosine) + filter(userId, isActive, category)
 *        - chatSummaryVector   on chatsummaries.embedding
 *            vector(3072, cosine) + filter(userId)
 *      The filter fields are REQUIRED: the $vectorSearch stages in src/tools/*
 *      pre-filter on userId/isActive/category, and Atlas rejects a filter on
 *      any field not declared as type:"filter".
 *
 * Idempotent: a vector index that already has the right filter fields is left
 * alone; one that's missing them is dropped and recreated.
 */
require("dotenv").config();
const path = require("path");
const mongoose = require("mongoose");

const EMBEDDING_DIMS = 3072; // gemini-embedding-001

const VECTOR_INDEXES = [
  {
    collection: "memories",
    name: "memoriesVector",
    fields: [
      { type: "vector", path: "embedding", numDimensions: EMBEDDING_DIMS, similarity: "cosine" },
      { type: "filter", path: "userId" },
      { type: "filter", path: "isActive" },
      { type: "filter", path: "category" },
    ],
  },
  {
    collection: "chatsummaries",
    name: "chatSummaryVector",
    fields: [
      { type: "vector", path: "embedding", numDimensions: EMBEDDING_DIMS, similarity: "cosine" },
      { type: "filter", path: "userId" },
    ],
  },
];

// Models registered on the DEFAULT mongoose connection (MONGO_URI).
const MAIN_MODELS = [
  "User", "ActionPlan", "Activity", "Chat", "FoodItem", "GlucoseReading", "Goal",
  "Meal", "MealScore", "Notification", "OnboardingAnswer", "Questionnaire",
  "ReferralSource", "ReportData", "SchemaInfo", "Subscription", "WearableData",
];

// Models registered on the VECTOR connection (VECTOR_DB_URI).
const VECTOR_MODELS = ["Memory", "ChatSummary", "CoreFact"];

const modelPath = (name) => path.join(__dirname, "..", "src", "models", name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function syncMany(label, names) {
  for (const name of names) {
    const Model = require(modelPath(name));
    if (typeof Model.syncIndexes !== "function") {
      console.warn(`  [${label}] SKIP ${name} (no syncIndexes export)`);
      continue;
    }
    await Model.syncIndexes();
    console.log(`  [${label}] ${name} -> ${Model.collection.name} ✓`);
  }
}

const filterPaths = (fields) =>
  (fields || []).filter((f) => f.type === "filter").map((f) => f.path).sort();

async function waitUntilGone(coll, name, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const list = await coll.listSearchIndexes().toArray();
    if (!list.find((x) => x.name === name)) return;
    await sleep(2000);
  }
}

async function ensureVectorIndex(db, { collection, name, fields }) {
  const existsColl = await db.listCollections({ name: collection }).toArray();
  if (existsColl.length === 0) {
    await db.createCollection(collection);
    console.log(`  [vector] created empty collection ${collection}`);
  }
  const coll = db.collection(collection);

  let existing;
  try {
    existing = (await coll.listSearchIndexes().toArray()).find((i) => i.name === name);
  } catch (e) {
    throw new Error(
      `listSearchIndexes failed on ${collection}: ${e.message} ` +
        `(is this an Atlas cluster with Search enabled?)`
    );
  }

  const want = filterPaths(fields);
  if (existing) {
    const have = filterPaths(existing.latestDefinition && existing.latestDefinition.fields);
    if (JSON.stringify(want) === JSON.stringify(have)) {
      console.log(`  [vector] ${name} on ${collection} already has filters [${want.join(", ")}] — skip`);
      return;
    }
    console.log(`  [vector] ${name} on ${collection} filters [${have.join(", ") || "none"}] → need [${want.join(", ")}]; dropping & recreating`);
    await coll.dropSearchIndex(name);
    await waitUntilGone(coll, name);
  }

  await coll.createSearchIndex({ name, type: "vectorSearch", definition: { fields } });
  console.log(`  [vector] created ${name} on ${collection} with filters [${want.join(", ")}] ✓ (builds async)`);
}

async function main() {
  // ---- 1. MAIN DB ----------------------------------------------------------
  console.log("Connecting MONGO_URI (normal db)...");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  console.log(`Connected -> db "${mongoose.connection.name}"`);
  console.log("Syncing main-model indexes:");
  await syncMany("main", MAIN_MODELS);

  // ---- 2. VECTOR DB regular indexes ---------------------------------------
  console.log("\nSyncing vector-model indexes (Memory/ChatSummary/CoreFact):");
  await syncMany("vector", VECTOR_MODELS);

  // ---- 3. VECTOR SEARCH indexes -------------------------------------------
  const { getVectorDb } = require("../src/config/vectorDb");
  const vconn = getVectorDb();
  await vconn.asPromise();
  console.log(`\nVector connection ready -> db "${vconn.name}"`);
  console.log("Ensuring Atlas Vector Search indexes (with filter fields):");
  for (const idx of VECTOR_INDEXES) {
    await ensureVectorIndex(vconn.db, idx);
  }

  // ---- Summary -------------------------------------------------------------
  console.log("\nDone. Vector search indexes may take ~1 min to finish building.");
  await mongoose.disconnect();
  await vconn.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  console.error(
    "\nIf this is a connection/timeout error, add this machine's IP " +
      "(or 0.0.0.0/0) under Atlas → Network Access, then re-run."
  );
  process.exit(1);
});
