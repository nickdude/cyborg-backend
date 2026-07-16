const CoreFact = require("../models/CoreFact");
const ChatSummary = require("../models/ChatSummary");
const { generateEmbedding } = require("./embeddings");
const { streamChat } = require("../providers/ai");

/**
 * Run post-chat processing after a response is delivered to the user.
 * Called fire-and-forget — errors are logged, never bubble up.
 *
 * Tasks (run in parallel):
 *   1. Extract/update core facts from this conversation
 *   2. Generate and save a chat summary with RAG embedding
 *
 * @param {string} userId
 * @param {string} chatId
 * @param {Array}  messages - Chat.messages array (all messages including latest)
 */
async function runPostProcessing(userId, chatId, messages, chatType = "patient") {
  const tasks = [
    generateChatSummary(userId, chatId, messages, chatType).catch(err =>
      console.error("[PostProcess] generateChatSummary failed:", err.message)
    ),
  ];
  // CoreFacts are the USER's persistent health facts (allergies, meds, etc.).
  // A doctor's chat about a patient must never mint these, so only extract them
  // for patient conversations.
  if (chatType !== "doctor") {
    tasks.unshift(
      updateCoreFacts(userId, messages).catch(err =>
        console.error("[PostProcess] updateCoreFacts failed:", err.message)
      )
    );
  }
  await Promise.allSettled(tasks);
  console.log(`[PostProcess] Done for chat ${chatId} (${chatType})`);
}

// -- Core fact extraction -----------------------------------------------------

async function updateCoreFacts(userId, messages) {
  // Only use the last 10 messages to keep the prompt small
  const recentMessages = messages.slice(-10);
  const conversationText = recentMessages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const existingFacts = await CoreFact.find({ userId }).lean();
  const existingText = existingFacts.length > 0
    ? existingFacts.map(f => `[${f._id}] (${f.category}/${f.importance}) ${f.fact}`).join("\n")
    : "None yet.";

  const prompt = `You are extracting persistent health facts about a user from a conversation.

EXISTING CORE FACTS:
${existingText}

RECENT CONVERSATION:
${conversationText}

Instructions:
- Return ONLY a JSON object with this exact shape:
  { "add": [...], "update": [...], "remove": [...] }
- add: new facts not already captured. Each: { fact, category, importance }
  - category: allergy | medication | goal | preference | health_flag | condition
  - importance: critical | high | medium
  - fact: max 150 chars, be specific
- update: changed existing facts. Each: { id, fact } where id is the [id] from EXISTING CORE FACTS
- remove: ids of facts no longer true (e.g. discontinued medication). Each: id string
- Max 3 new adds per call. Skip facts already in onboarding (name, basic demographics).
- If nothing changed, return { "add": [], "update": [], "remove": [] }
- Return ONLY the JSON, no explanation.`;

  const { text } = await streamChat({
    messages: [{ role: "user", content: prompt }],
    systemPrompt: "You are a precise medical data extractor. Return only valid JSON.",
    tools: [],
    executeTool: async () => ({}),
    emit: () => {},
    enableThinking: false,
  });

  let diff;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    diff = JSON.parse(jsonMatch?.[0] || text);
  } catch {
    console.warn("[PostProcess] Failed to parse core fact diff:", text.slice(0, 200));
    return;
  }

  const ops = [];

  if (Array.isArray(diff.add)) {
    const currentCount = await CoreFact.countDocuments({ userId });
    const slotsAvailable = Math.max(0, 30 - currentCount);
    const toAdd = diff.add.slice(0, slotsAvailable);
    for (const item of toAdd) {
      if (!item.fact || !item.category || !item.importance) continue;
      ops.push(CoreFact.create({ userId, fact: item.fact.slice(0, 200), category: item.category, importance: item.importance }));
    }
  }

  if (Array.isArray(diff.update)) {
    for (const item of diff.update) {
      if (!item.id || !item.fact) continue;
      ops.push(CoreFact.findByIdAndUpdate(item.id, { fact: item.fact.slice(0, 200) }));
    }
  }

  if (Array.isArray(diff.remove)) {
    for (const id of diff.remove) {
      if (!id) continue;
      ops.push(CoreFact.findByIdAndDelete(id));
    }
  }

  await Promise.allSettled(ops);
  console.log(`[PostProcess] CoreFacts updated: +${diff.add?.length ?? 0} ~${diff.update?.length ?? 0} -${diff.remove?.length ?? 0}`);
}

// -- Chat summary generation --------------------------------------------------

async function generateChatSummary(userId, chatId, messages, chatType = "patient") {
  if (messages.length < 2) return;  // Not enough to summarize

  const conversationText = messages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 400)}`)
    .join("\n\n");

  const prompt = `Summarize this health conversation in 3-5 sentences. Then list the key topics.

CONVERSATION:
${conversationText}

Return ONLY a JSON object:
{
  "summary": "3-5 sentence summary of what was discussed and any conclusions reached",
  "keyTopics": ["topic1", "topic2", ...]
}
keyTopics: 3-8 lowercase keywords (e.g. "iron deficiency", "sleep quality", "semaglutide dosing")
Return ONLY the JSON.`;

  const { text } = await streamChat({
    messages: [{ role: "user", content: prompt }],
    systemPrompt: "You are a medical conversation summarizer. Return only valid JSON.",
    tools: [],
    executeTool: async () => ({}),
    emit: () => {},
    enableThinking: false,
  });

  let parsed;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] || text);
  } catch {
    console.warn("[PostProcess] Failed to parse summary:", text.slice(0, 200));
    return;
  }

  if (!parsed.summary) return;

  // Generate embedding for vector search
  let embedding = null;
  try {
    const embeddingText = `${parsed.summary} ${(parsed.keyTopics || []).join(" ")}`;
    embedding = await generateEmbedding(embeddingText);
  } catch (err) {
    console.warn("[PostProcess] Embedding generation failed:", err.message);
    // Save summary without embedding — keyword search still works
  }

  await ChatSummary.findOneAndUpdate(
    { chatId },
    {
      chatId,
      userId,
      chatType,
      summary: parsed.summary.slice(0, 600),
      keyTopics: (parsed.keyTopics || []).slice(0, 8),
      embedding,
      messageCount: messages.length,
      chatDate: new Date(),
    },
    { upsert: true, new: true }
  );

  console.log(`[PostProcess] ChatSummary saved for chat ${chatId} | embedding: ${embedding ? "yes" : "no"}`);
}

module.exports = { runPostProcessing };
