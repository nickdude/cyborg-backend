const { GoogleGenerativeAI } = require("@google/generative-ai");

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMS = 3072;

let _primaryKey = null;
let _fallbackKeys = null;
let _fallbackIndex = 0;

function loadKeys() {
  if (_fallbackKeys !== null) return;
  _primaryKey = process.env.GEMINI_API_KEY_primary || null;
  _fallbackKeys = [];
  for (let i = 1; i <= 20; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k) _fallbackKeys.push(k);
  }
  if (!_primaryKey && _fallbackKeys.length === 0)
    throw new Error("No GEMINI_API_KEY_* found for embeddings");
}

function isKeyError(err) {
  const code = err?.status || err?.statusCode || err?.code;
  if (code === 429 || code === 403) return true;
  const msg = (err?.message || "").toLowerCase();
  return msg.includes("quota") || msg.includes("rate limit") || msg.includes("resource exhausted");
}

async function _embed(text, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent(text);
  const values = result.embedding?.values;
  if (!values || values.length !== EMBEDDING_DIMS) {
    throw new Error(`Unexpected embedding dimensions: got ${values?.length}, expected ${EMBEDDING_DIMS}`);
  }
  return values;
}

async function generateEmbedding(text) {
  loadKeys();
  if (_primaryKey) {
    try {
      return await _embed(text, _primaryKey);
    } catch (err) {
      if (isKeyError(err) && _fallbackKeys.length > 0) {
        console.warn("[Embeddings] Primary key quota/rate error, using fallback");
      } else throw err;
    }
  }
  const key = _fallbackKeys[_fallbackIndex % _fallbackKeys.length];
  _fallbackIndex++;
  return await _embed(text, key);
}

module.exports = { generateEmbedding };
