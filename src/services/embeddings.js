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

  // Build ordered pool: primary first, then fallbacks starting at round-robin position.
  // This ensures every call tries the primary cheaply, but distributes fallback load across calls.
  const pool = [];
  if (_primaryKey) pool.push(_primaryKey);
  for (let i = 0; i < _fallbackKeys.length; i++) {
    pool.push(_fallbackKeys[(_fallbackIndex + i) % _fallbackKeys.length]);
  }

  let lastKeyError = null;

  for (let i = 0; i < pool.length; i++) {
    const key = pool[i];
    try {
      const result = await _embed(text, key);
      // Advance round-robin when a fallback key succeeds so future calls start from the next one
      if (_fallbackKeys.length > 0 && (i > 0 || !_primaryKey)) {
        _fallbackIndex = (_fallbackIndex + 1) % _fallbackKeys.length;
      }
      return result;
    } catch (err) {
      if (!isKeyError(err)) throw err; // non-key error (bad input etc.) — fail fast, don't burn pool
      lastKeyError = err;
      const label = (i === 0 && _primaryKey) ? 'primary' : `fallback[${_primaryKey ? i : i + 1}]`;
      console.warn(`[Embeddings] Key ${label} quota/rate error, trying next`);
    }
  }

  throw new Error(
    `[Embeddings] All ${pool.length} API key(s) exhausted. Last error: ${lastKeyError?.message}`
  );
}

module.exports = { generateEmbedding };
