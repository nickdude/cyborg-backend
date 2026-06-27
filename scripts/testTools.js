/**
 * Smoke-tests every concierge AI tool against the current env (new cluster + Gemini key).
 *   node scripts/testTools.js
 * Calls each tool's execute(input, userId, chatId) like the controllers do, reports a verdict,
 * and runs a saveMemory -> recallMemories round-trip to exercise embeddings + vector search.
 * Cleans up the test memories it writes.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");

const getMedicalData = require("../src/tools/getMedicalData");
const getWearableData = require("../src/tools/getWearableData");
const getMealData = require("../src/tools/getMealData");
const searchChatHistory = require("../src/tools/searchChatHistory");
const fetchFullChat = require("../src/tools/fetchFullChat");
const webSearch = require("../src/tools/webSearch");
const searchMedicalEvidence = require("../src/tools/searchMedicalEvidence");
const suggestMedication = require("../src/tools/suggestMedication");
const getSchemaInfo = require("../src/tools/getSchemaInfo");
const getMealDataDup = getMealData;
const { saveMemoryTool, recallMemoriesTool } = require("../src/tools/episodicMemory");
const Memory = require("../src/models/Memory");

const USER = new mongoose.Types.ObjectId("0123456789abcdef01234567");
const CHAT = new mongoose.Types.ObjectId("0123456789abcdef01234568");

function summarize(r) {
  if (r === null || r === undefined) return "null/undefined";
  if (typeof r !== "object") return String(r).slice(0, 120);
  if (r.error) return `error: ${String(r.error).slice(0, 140)}`;
  const keys = Object.keys(r);
  let extra = "";
  if (Array.isArray(r.results)) extra = ` results=${r.results.length}`;
  if (r.answer) extra += ` answer=${String(r.answer).length}c`;
  if (r.content) extra += ` content=${String(r.content).length}c`;
  if (typeof r.count === "number") extra += ` count=${r.count}`;
  if (r.method) extra += ` method=${r.method}`;
  if (r.saved !== undefined) extra += ` saved=${r.saved}`;
  return `{${keys.slice(0, 8).join(",")}}${extra}`;
}

async function run(label, fn) {
  const t = Date.now();
  try {
    const r = await fn();
    const ms = Date.now() - t;
    const verdict = r && r.error ? "⚠️  ERR " : "✓ OK   ";
    console.log(`${verdict} ${label.padEnd(22)} ${String(ms).padStart(6)}ms  ${summarize(r)}`);
    return r;
  } catch (e) {
    const ms = Date.now() - t;
    console.log(`❌ THREW ${label.padEnd(22)} ${String(ms).padStart(6)}ms  ${(e.message || e).toString().slice(0, 160)}`);
    return { __threw: true };
  }
}

async function main() {
  await connectDB();
  console.log(`Main DB connected. Testing 11 tools as user ${USER}\n`);

  // --- DB / data tools (empty DB -> expect graceful empty) ---
  await run("getSchemaInfo", () => getSchemaInfo.execute({ collection: "all" }, USER, CHAT));
  await run("getMedicalData", () => getMedicalData.execute({ include: ["profile", "onboarding", "reports"] }, USER, CHAT));
  await run("getWearableData", () => getWearableData.execute({ days: 30 }, USER, CHAT));
  await run("getMealData", () => getMealDataDup.execute({ days: 7 }, USER, CHAT));
  await run("fetchFullChat", () => fetchFullChat.execute({ chatId: CHAT.toString() }, USER, CHAT));
  await run("searchChatHistory", () => searchChatHistory.execute({ query: "sleep issues", limit: 3 }, USER, CHAT));

  // --- pure / hardcoded tool ---
  await run("suggestMedication", () => suggestMedication.execute({ name: "AMINO9", reason: "muscle recovery", dose: "1 scoop" }, USER, CHAT));

  // --- external API tools (verify keys work) ---
  await run("webSearch", () => webSearch.execute({ query: "2026 research creatine and cognition" }, USER, CHAT));
  await run("searchMedicalEvidence", () => searchMedicalEvidence.execute({ query: "omega-3 effect on triglycerides" }, USER, CHAT));

  // --- memory round-trip (embeddings + vector search) ---
  console.log("\n-- saveMemory -> recallMemories round-trip (Gemini embed + Atlas vector) --");
  await run("saveMemory", () => saveMemoryTool.execute(
    { content: "User prefers training in the early morning before breakfast.", category: "preference", tags: ["exercise", "morning"], importance: "low", source: "user_explicit" },
    USER, CHAT
  ));
  const recall = await run("recallMemories", () => recallMemoriesTool.execute({ query: "when does the user like to work out", limit: 3 }, USER, CHAT));
  if (recall && Array.isArray(recall.results)) {
    const hit = recall.results.find((m) => /morning/i.test(m.content || ""));
    console.log(`   round-trip: ${hit ? "✓ recalled the saved memory" : "⚠️  saved memory not found in recall"} (method=${recall.method})`);
  }

  // --- cleanup test memories ---
  const del = await Memory.deleteMany({ userId: USER });
  console.log(`\nCleaned up ${del.deletedCount} test memory doc(s).`);

  await mongoose.disconnect();
  try { const { getVectorDb } = require("../src/config/vectorDb"); await getVectorDb().close(); } catch {}
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
