/**
 * Shared Perplexity Sonar API client.
 * Used by both webSearch and searchMedicalEvidence tools.
 *
 * Env var read at call time (lazy) — same pattern as the rest of this codebase
 * to avoid require-hoisting races before dotenv.config() runs.
 */

const axios = require("axios");

/**
 * @param {object} opts
 * @param {string} opts.model                    - Sonar model ('sonar' or 'sonar-pro')
 * @param {string} opts.query                    - User query / question
 * @param {string} opts.systemPrompt             - System instruction for Sonar
 * @param {string[]} [opts.searchDomainFilter]   - Restrict results to these domains
 * @param {string}  [opts.searchContextSize]     - 'low' | 'medium' | 'high'
 * @param {string}  [opts.searchRecencyFilter]   - 'month' | 'week' | 'day' | 'hour'
 * @returns {Promise<{ answer: string, citations: { url: string, domain: string }[] } | { error: string }>}
 */
async function querySonar({
  model,
  query,
  systemPrompt,
  searchDomainFilter,
  searchContextSize,
  searchRecencyFilter,
}) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return { error: "Perplexity API is not configured (missing PERPLEXITY_API_KEY)" };

  try {
    const body = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
    };

    if (searchDomainFilter?.length) body.search_domain_filter = searchDomainFilter;
    if (searchContextSize) body.search_context_size = searchContextSize;
    if (searchRecencyFilter) body.search_recency_filter = searchRecencyFilter;

    const res = await axios.post("https://api.perplexity.ai/chat/completions", body, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      // Bound the request so a stalled/hung upstream can never wedge a caller
      // (e.g. the action-plan generation job) indefinitely.
      timeout: 30_000,
    });

    const data = res.data;
    const answer = data.choices?.[0]?.message?.content || "";
    const rawCitations = data.citations || [];

    // Titles live in search_results (citations[] are bare URL strings). Map url→title.
    const titleByUrl = {};
    for (const s of (data.search_results || [])) {
      if (s?.url) titleByUrl[s.url] = s.title || "";
    }

    const citations = rawCitations.map(url => {
      let domain = url;
      try { domain = new URL(url).hostname; } catch {}
      return { url, domain, title: titleByUrl[url] || "" };
    });

    return { answer, citations };
  } catch (err) {
    const errMsg = err.response
      ? `Perplexity API error ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : `Perplexity request failed: ${err.message}`;
    return { error: errMsg };
  }
}

module.exports = { querySonar };
