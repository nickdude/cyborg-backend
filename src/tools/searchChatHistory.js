const mongoose = require("mongoose");
const ChatSummary = require("../models/ChatSummary");
const { generateEmbedding } = require("../services/embeddings");

const definition = {
  name: 'searchChatHistory',
  description: 'Search past conversations using semantic similarity. Use when the user references something from a previous session, asks what you remember, or when past context might be relevant. Returns matching conversation summaries with their chatIds. If a summary looks highly relevant, call fetchFullChat to get the complete messages.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What to search for (e.g. "iron levels discussion", "sleep issues", "semaglutide side effects").',
      },
      limit: {
        type: 'number',
        description: 'Max results to return (1-5). Defaults to 3.',
      },
    },
    required: ['query'],
  },
};

async function execute(input, userId, chatId) {
  const { query, limit: rawLimit = 3 } = input;
  const limit = Math.min(Math.max(rawLimit, 1), 5);

  // Try vector search first (requires Atlas Vector Search index)
  try {
    const embedding = await generateEmbedding(query);
    const results = await ChatSummary.aggregate([
      {
        $vectorSearch: {
          index: 'chatSummaryVector',
          path: 'embedding',
          queryVector: embedding,
          // Atlas recommends numCandidates >> limit; use ~15x for reliable recall
          numCandidates: Math.max(100, limit * 15),
          limit,
          filter: { userId: new mongoose.Types.ObjectId(userId.toString()) },
        },
      },
      {
        $project: {
          chatId: 1,
          summary: 1,
          keyTopics: 1,
          chatDate: 1,
          messageCount: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ]);

    if (results.length > 0) {
      return {
        method: 'vector',
        query,
        results: results.map(r => ({
          chatId: r.chatId.toString(),
          summary: r.summary,
          keyTopics: r.keyTopics,
          date: r.chatDate,
          messageCount: r.messageCount,
          // vectorSearchScore is already in [0, 1]
          relevanceScore: Math.round((r.score ?? 0) * 100) / 100,
          match: 'semantic',
        })),
        resultCount: results.length,
      };
    }
  } catch (err) {
    // Vector search not available — fall back to keyword search
    console.warn('[searchChatHistory] Vector search failed, using keyword fallback:', err.message);
  }

  // Keyword fallback: search keyTopics and summary text. Exclude doctor-origin
  // summaries as defense-in-depth (they are already stored under the doctor's
  // id, so a patient-scoped query should never see one).
  const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const summaries = await ChatSummary.find({ userId, chatType: { $ne: "doctor" } })
    .sort({ chatDate: -1 })
    .limit(50)
    .lean();

  const scored = summaries.map(s => {
    const text = `${s.summary} ${s.keyTopics.join(' ')}`.toLowerCase();
    const hits = queryTokens.filter(t => text.includes(t)).length;
    return { ...s, score: hits };
  })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    method: 'keyword',
    query,
    results: scored.map(s => ({
      chatId: s.chatId.toString(),
      summary: s.summary,
      keyTopics: s.keyTopics,
      date: s.chatDate,
      messageCount: s.messageCount,
      // Normalize raw hit-count to [0, 1] so scores are comparable to the semantic tier
      relevanceScore: queryTokens.length > 0
        ? Math.min(Math.round((s.score / queryTokens.length) * 100) / 100, 1)
        : 0,
      match: 'keyword',
    })),
    result_count: scored.length,
  };
}

module.exports = { definition, execute };
