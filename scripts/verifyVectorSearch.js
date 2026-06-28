/**
 * Verifies the $vectorSearch filter fix end-to-end. node scripts/verifyVectorSearch.js
 * Waits for the vector indexes to be READY, then runs the SAME $vectorSearch
 * pipelines the tools use (ObjectId filter on userId/isActive). Empty results are
 * fine — success = it does NOT throw "needs to be indexed as filter".
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Memory = require("../src/models/Memory");
const ChatSummary = require("../src/models/ChatSummary");
const { generateEmbedding } = require("../src/services/embeddings");
const { getVectorDb } = require("../src/config/vectorDb");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const filters = (idx) =>
  ((idx.latestDefinition && idx.latestDefinition.fields) || [])
    .filter((f) => f.type === "filter").map((f) => f.path);

async function waitReady(coll, name, tries = 45) {
  for (let i = 0; i < tries; i++) {
    const idx = (await coll.listSearchIndexes().toArray()).find((x) => x.name === name);
    if (idx && idx.queryable && idx.status === "READY") return idx;
    await sleep(3000);
  }
  return null;
}

async function main() {
  const v = getVectorDb();
  await v.asPromise();

  console.log("Waiting for vector indexes to be READY (rebuild after filter-field change)...");
  const m = await waitReady(v.db.collection("memories"), "memoriesVector");
  const c = await waitReady(v.db.collection("chatsummaries"), "chatSummaryVector");
  console.log(`  memoriesVector:    ${m ? m.status + "/queryable filters=" + JSON.stringify(filters(m)) : "NOT READY"}`);
  console.log(`  chatSummaryVector: ${c ? c.status + "/queryable filters=" + JSON.stringify(filters(c)) : "NOT READY"}`);

  const userId = new mongoose.Types.ObjectId();
  const qv = await generateEmbedding("test query about iron levels");
  console.log(`\nRunning filtered $vectorSearch (dummy userId, empty data → expect 0 results, NO throw):`);

  try {
    const r = await Memory.aggregate([
      { $vectorSearch: { index: "memoriesVector", path: "embedding", queryVector: qv, numCandidates: 50, limit: 3, filter: { userId, isActive: true } } },
      { $project: { content: 1, score: { $meta: "vectorSearchScore" } } },
    ]);
    console.log(`  ✓ memoriesVector: OK (no throw), results=${r.length}`);
  } catch (e) { console.log(`  ✗ memoriesVector: FAIL — ${(e.message || "").slice(0, 220)}`); }

  try {
    const r = await ChatSummary.aggregate([
      { $vectorSearch: { index: "chatSummaryVector", path: "embedding", queryVector: qv, numCandidates: 20, limit: 3, filter: { userId } } },
      { $project: { summary: 1, score: { $meta: "vectorSearchScore" } } },
    ]);
    console.log(`  ✓ chatSummaryVector: OK (no throw), results=${r.length}`);
  } catch (e) { console.log(`  ✗ chatSummaryVector: FAIL — ${(e.message || "").slice(0, 220)}`); }

  await v.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
