const mongoose = require("mongoose");
const Memory = require("../models/Memory");
const { generateEmbedding } = require("../services/embeddings");

// -- Shared helpers ----------------------------------------------------------

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dot / mag;
}

const MAX_MEMORIES_PER_USER = 200;
const EMBEDDING_DEDUP_THRESHOLD = 0.85;

// -- save_memory -------------------------------------------------------------

const saveMemoryTool = {
  definition: {
    name: 'saveMemory',
    description: 'Save a piece of information about the user for long-term recall across conversations. Use when the user explicitly asks you to remember something, or when you detect a meaningful change (new goal, medication change, new symptom, lifestyle shift). Do NOT save information already captured in onboarding data.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The memory to save — a concise 1-2 sentence summary of the information (max 500 chars).',
        },
        category: {
          type: 'string',
          enum: ['preference', 'goal', 'health_event', 'lifestyle', 'medication', 'symptom', 'general'],
          description: 'Category of the memory.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lowercase keywords for search (e.g. ["exercise", "morning", "preference"]).',
        },
        importance: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Importance level. Use "high" for medication changes, allergies, adverse reactions. Use "low" for casual preferences.',
        },
        source: {
          type: 'string',
          enum: ['ai_detected', 'user_explicit'],
          description: '"user_explicit" when user says "remember that...", "ai_detected" when you proactively save.',
        },
        expires_in_days: {
          type: 'number',
          description: 'Optional — auto-delete after this many days. Use for temporary states (e.g. "feeling sick this week").',
        },
      },
      required: ['content', 'category', 'tags', 'importance', 'source'],
    },
  },

  async execute(input, userId, chatId) {
    const { content, category, tags, importance, source, expires_in_days } = input;

    if (!content || content.trim().length === 0) {
      return { saved: false, error: 'Content is empty' };
    }

    // -- Fetch recent same-category memories for dedup ----------------------
    const recentMemories = await Memory.find({
      userId,
      category,
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    // -- Token-based dedup (fast, catches exact rephrasing) -----------------
    const newTokens = tokenize(content);
    if (newTokens.length > 0) {
      for (const existing of recentMemories) {
        const existingTokens = tokenize(existing.content);
        if (existingTokens.length === 0) continue;
        const overlap = newTokens.filter(t => existingTokens.includes(t)).length;
        const overlapRatio = overlap / Math.max(newTokens.length, existingTokens.length);
        if (overlapRatio > 0.7) {
          return { saved: false, error: 'duplicate', existing_memory: existing.content };
        }
      }
    }

    // -- Embedding-based dedup (catches semantic equivalence) ---------------
    let newEmbedding = null;
    try {
      newEmbedding = await generateEmbedding(content);
      const memoriesWithEmbeddings = recentMemories.filter(m => m.embedding && m.embedding.length > 0);
      for (const existing of memoriesWithEmbeddings) {
        const similarity = cosineSimilarity(newEmbedding, existing.embedding);
        if (similarity >= EMBEDDING_DEDUP_THRESHOLD) {
          return { saved: false, error: 'duplicate', existing_memory: existing.content };
        }
      }
    } catch (err) {
      console.warn('[saveMemory] Embedding generation failed, skipping semantic dedup:', err.message);
    }

    // -- Cap enforcement ----------------------------------------------------
    const totalCount = await Memory.countDocuments({ userId, isActive: true });
    if (totalCount >= MAX_MEMORIES_PER_USER) {
      const evicted = await Memory.findOneAndUpdate(
        { userId, isActive: true, importance: 'low' },
        { isActive: false },
        { sort: { createdAt: 1 } }
      );
      if (!evicted) {
        await Memory.findOneAndUpdate(
          { userId, isActive: true, importance: 'medium' },
          { isActive: false },
          { sort: { createdAt: 1 } }
        );
      }
    }

    // -- Save ---------------------------------------------------------------
    const memory = await Memory.create({
      userId,
      content: content.slice(0, 500),
      category,
      tags: tags || [],
      importance: importance || 'medium',
      source: source || 'ai_detected',
      chatId: chatId || null,
      embedding: newEmbedding,
      expiresAt: expires_in_days ? new Date(Date.now() + expires_in_days * 86400000) : null,
    });

    return {
      saved: true,
      memory_id: memory._id.toString(),
      content: memory.content,
      category: memory.category,
    };
  },
};

// -- recall_memories ---------------------------------------------------------

const recallMemoriesTool = {
  definition: {
    name: 'recallMemories',
    description: 'Search the user\'s saved memories for relevant context from past conversations. Use when the user asks "what do you remember about...", references a past preference or goal, or when you need cross-session context for personalized advice.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query describing what to recall (e.g. "exercise preferences", "medication changes", "sleep issues").',
        },
        category: {
          type: 'string',
          enum: ['preference', 'goal', 'health_event', 'lifestyle', 'medication', 'symptom', 'general', 'all'],
          description: 'Filter by category, or "all" to search everything. Defaults to "all".',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (1-10). Defaults to 5.',
        },
      },
      required: ['query'],
    },
  },

  async execute(input, userId, chatId) {
    const { query, category = 'all', limit: rawLimit } = input;
    const limit = Math.min(Math.max(rawLimit || 5, 1), 10);

    const filter = { userId, isActive: true };
    if (category !== 'all') filter.category = category;

    // -- Generate query embedding once (reused across fallback tiers) -------
    let queryEmbedding = null;
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch (err) {
      console.warn('[recallMemories] Embedding generation failed, falling back to keyword search:', err.message);
    }

    if (queryEmbedding) {
      // -- Tier 1: Atlas vector search --------------------------------------
      try {
        const vectorFilter = { userId: new mongoose.Types.ObjectId(userId.toString()), isActive: true };
        if (category !== 'all') vectorFilter.category = category;

        const results = await Memory.aggregate([
          {
            $vectorSearch: {
              index: 'memoriesVector',
              path: 'embedding',
              queryVector: queryEmbedding,
              numCandidates: 50,
              limit,
              filter: vectorFilter,
            },
          },
          {
            $project: {
              content: 1,
              category: 1,
              tags: 1,
              importance: 1,
              source: 1,
              createdAt: 1,
              score: { $meta: 'vectorSearchScore' },
            },
          },
        ]);

        if (results.length > 0) {
          return {
            method: 'vector',
            query,
            results: results.map(r => ({
              memory_id: r._id.toString(),
              content: r.content,
              category: r.category,
              tags: r.tags,
              importance: r.importance,
              source: r.source,
              created_at: r.createdAt,
              relevance_score: Math.round((r.score ?? 0) * 100) / 100,
            })),
            result_count: results.length,
          };
        }
      } catch (err) {
        console.warn('[recallMemories] Vector search failed, trying cosine fallback:', err.message);
      }

      // -- Tier 2: In-memory cosine similarity (any MongoDB) ----------------
      try {
        const memoriesWithEmbeddings = await Memory.find({
          ...filter,
          embedding: { $exists: true, $ne: null },
        })
          .limit(200)
          .lean();

        if (memoriesWithEmbeddings.length > 0) {
          const scored = memoriesWithEmbeddings
            .map(m => ({ ...m, score: cosineSimilarity(queryEmbedding, m.embedding) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

          return {
            method: 'cosine',
            query,
            results: scored.map(r => ({
              memory_id: r._id.toString(),
              content: r.content,
              category: r.category,
              tags: r.tags,
              importance: r.importance,
              source: r.source,
              created_at: r.createdAt,
              relevance_score: Math.round(r.score * 100) / 100,
            })),
            result_count: scored.length,
          };
        }
      } catch (err) {
        console.warn('[recallMemories] Cosine fallback failed, using keyword search:', err.message);
      }
    }

    // -- Tier 3: Keyword search (original, always works) --------------------
    const memories = await Memory.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    if (memories.length === 0) {
      return { query, results: [], result_count: 0, message: 'No memories found for this user.' };
    }

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
      const recent = memories.slice(0, limit).map(formatMemory);
      return { method: 'keyword', query, results: recent, result_count: recent.length };
    }

    const now = Date.now();
    const scored = memories.map(mem => {
      const memText = `${mem.content} ${mem.tags.join(' ')} ${mem.category}`.toLowerCase();

      let keywordScore = 0;
      for (const qt of queryTokens) {
        if (memText.includes(qt)) keywordScore++;
      }

      let tagBonus = 0;
      for (const qt of queryTokens) {
        if (mem.tags.includes(qt)) tagBonus += 0.5;
      }

      const importanceBoost = mem.importance === 'high' ? 0.5 : mem.importance === 'medium' ? 0.2 : 0;

      const ageMs = now - new Date(mem.createdAt).getTime();
      const ageDays = ageMs / 86400000;
      const recencyBoost = Math.max(0, 1 - ageDays / 90) * 0.3;

      return { ...mem, score: keywordScore + tagBonus + importanceBoost + recencyBoost };
    });

    scored.sort((a, b) => b.score - a.score);
    const topResults = scored
      .filter(m => m.score > 0)
      .slice(0, limit)
      .map(formatMemory);

    return {
      method: 'keyword',
      query,
      category,
      results: topResults,
      result_count: topResults.length,
    };
  },
};

function formatMemory(mem) {
  return {
    memory_id: mem._id.toString(),
    content: mem.content,
    category: mem.category,
    tags: mem.tags,
    importance: mem.importance,
    source: mem.source,
    created_at: mem.createdAt,
    relevance_score: mem.score !== undefined ? Math.round(mem.score * 100) / 100 : undefined,
  };
}

module.exports = { saveMemoryTool, recallMemoriesTool };
