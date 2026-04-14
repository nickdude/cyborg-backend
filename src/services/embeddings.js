const { GoogleGenerativeAI } = require("@google/generative-ai");

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMS = 3072;

let _keyIndex = 0;
let _keys = null;

function getNextKey() {
  if (!_keys) {
    _keys = [];
    for (let i = 1; i <= 20; i++) {
      const k = process.env[`GEMINI_API_KEY_${i}`];
      if (k) _keys.push(k);
    }
    if (_keys.length === 0) throw new Error("No GEMINI_API_KEY_* found for embeddings");
  }
  const key = _keys[_keyIndex % _keys.length];
  _keyIndex++;
  return key;
}

/**
 * Generate a 3072-dim embedding for a text string.
 * Uses gemini-embedding-001 via round-robin Gemini keys.
 *
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function generateEmbedding(text) {
  const genAI = new GoogleGenerativeAI(getNextKey());
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent(text);
  const values = result.embedding?.values;
  if (!values || values.length !== EMBEDDING_DIMS) {
    throw new Error(`Unexpected embedding dimensions: got ${values?.length}, expected ${EMBEDDING_DIMS}`);
  }
  return values;
}

module.exports = { generateEmbedding };
