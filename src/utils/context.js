const MAX_MESSAGES = parseInt(process.env.MAX_CONTEXT_MESSAGES || '30', 10)

/**
 * Trims the message list to the most recent MAX_CONTEXT_MESSAGES entries.
 * When trimming occurs, prepends a synthetic exchange so Claude knows older
 * messages were omitted and can use getMedicalData/searchChatHistory to recover context.
 */
function buildContextMessages(allMessages) {
  // Drop assistant turns that persisted with empty/whitespace content (tool-only,
  // aborted, or empty completions). Such a non-final assistant message replays to
  // the model as empty content — Anthropic rejects it (400: "all messages must
  // have non-empty content except the optional final assistant message") and
  // Gemini receives parts:[{text:''}]. That 400 throws out of the chat loop, so no
  // new assistant message is saved and the poison turn keeps failing every
  // subsequent turn until it scrolls out of the window — effectively bricking the
  // chat. Removing it here is safe: it carries no text for the provider and its
  // toolUses aren't sent in the context anyway. User and non-empty assistant
  // messages are untouched.
  allMessages = allMessages.filter(m => !(m.role === "assistant" && !(m.content && m.content.trim())))

  if (allMessages.length <= MAX_MESSAGES) return allMessages

  const omitted = allMessages.length - MAX_MESSAGES
  const trimmed = allMessages.slice(-MAX_MESSAGES)

  console.log(`[Context] Trimmed ${omitted} old message(s), keeping last ${MAX_MESSAGES}`)

  return [
    {
      role: 'user',
      content: `[System note: ${omitted} earlier message(s) from this conversation have been omitted to stay within context limits. Use the getMedicalData tool to retrieve the user's health profile and reports, or searchChatHistory to look up previous sessions if needed.]`,
    },
    {
      role: 'assistant',
      content: 'Understood. I will use the available tools to retrieve any context I need.',
    },
    ...trimmed,
  ]
}

module.exports = { buildContextMessages };
