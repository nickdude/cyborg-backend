/**
 * Probe every Gemini key in .env: is it valid/working, on which model.
 *   node scripts/checkGeminiKeys.js
 * Sends ONE tiny embedding request per key (active use), plus one flash
 * request for the primary key. Read-only-ish: consumes negligible quota.
 */
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const EMBEDDING_MODEL = "gemini-embedding-001";
const FLASH_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function collectKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEY_primary)
    keys.push({ name: "primary", key: process.env.GEMINI_API_KEY_primary });
  for (let i = 1; i <= 20; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k) keys.push({ name: `fallback_${i}`, key: k });
  }
  return keys;
}

const mask = (k) => `${k.slice(0, 6)}…${k.slice(-4)} (${k.length}c)`;

async function testEmbed(key) {
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const r = await model.embedContent("ping");
  return r.embedding?.values?.length || 0;
}

async function testFlash(key) {
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: FLASH_MODEL });
  const r = await model.generateContent("Reply with the single word: ok");
  return (r.response?.text() || "").trim().slice(0, 20);
}

function classify(err) {
  const code = err?.status || err?.statusCode || err?.code || "";
  const msg = (err?.message || "").replace(/\s+/g, " ").slice(0, 160);
  let tag = "ERROR";
  if (code === 429 || /quota|rate limit|resource exhausted/i.test(msg)) tag = "RATE/QUOTA";
  else if (code === 400 && /api key not valid|invalid/i.test(msg)) tag = "INVALID KEY";
  else if (code === 401 || code === 403) tag = "AUTH";
  return `${tag} [${code}] ${msg}`;
}

async function main() {
  const keys = collectKeys();
  console.log(`Found ${keys.length} Gemini keys. Embedding model: ${EMBEDDING_MODEL}\n`);
  for (const { name, key } of keys) {
    let line = `${name.padEnd(11)} ${mask(key).padEnd(22)} `;
    try {
      const dims = await testEmbed(key);
      line += `embed: ✓ ${dims} dims`;
    } catch (e) {
      line += `embed: ✗ ${classify(e)}`;
    }
    if (name === "primary") {
      try { line += `  |  flash: ✓ "${await testFlash(key)}"`; }
      catch (e) { line += `  |  flash: ✗ ${classify(e)}`; }
    }
    console.log(line);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
