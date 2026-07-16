/**
 * Dependency-free fuzzy string matching for typo-tolerant search
 * ("panner" → "Paneer", "chiken" → "Chicken").
 *
 * Scoring per query token = best of bigram Dice coefficient and normalized
 * Damerau-Levenshtein (OSA) similarity against the candidate's tokens; a
 * candidate's score is the mean over query tokens, so every typed word must
 * land somewhere on the candidate. Callers pick their own accept threshold
 * (0.72 works well for food/activity names).
 */

const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokenize = (s) => normalize(s).split(" ").filter(Boolean);

// Optimal-string-alignment Damerau-Levenshtein: edits + adjacent transposition.
function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev2 = null;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur.push(v);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

function bigrams(s) {
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function diceCoefficient(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let hits = 0;
  for (const g of A) if (B.has(g)) hits++;
  return (2 * hits) / (A.size + B.size);
}

// Both arguments must already be normalized single tokens.
function tokenSimilarity(q, c) {
  if (q === c) return 1;
  if (q.length < 3 || c.length < 3) return 0; // too short to fuzzy safely
  // Forward prefix only (typing "pane" hoping for "paneer"), and the typed
  // token must cover at least half the candidate — otherwise 3-letter aliases
  // like "pan" (betel leaf) hijack longer queries such as "panner".
  if (c.startsWith(q) && q.length / c.length >= 0.5) return 0.92;
  const editSim = 1 - editDistance(q, c) / Math.max(q.length, c.length);
  return Math.max(diceCoefficient(q, c), editSim);
}

/**
 * Mean over query tokens of the best-matching candidate token.
 * Returns 0 when any query token finds no match at all.
 */
function fuzzyScore(queryTokens, candidateTokens) {
  if (!queryTokens.length || !candidateTokens.length) return 0;
  let total = 0;
  for (const qt of queryTokens) {
    let best = 0;
    for (const ct of candidateTokens) {
      const s = tokenSimilarity(qt, ct);
      if (s > best) best = s;
      if (best === 1) break;
    }
    if (best === 0) return 0;
    total += best;
  }
  return total / queryTokens.length;
}

/** Best fuzzyScore across several candidate token arrays (name + aliases). */
function bestFuzzyScore(queryTokens, candidateTokenLists) {
  let best = 0;
  for (const tokens of candidateTokenLists) {
    const s = fuzzyScore(queryTokens, tokens);
    if (s > best) best = s;
    if (best === 1) break;
  }
  return best;
}

module.exports = { normalize, tokenize, tokenSimilarity, fuzzyScore, bestFuzzyScore };
