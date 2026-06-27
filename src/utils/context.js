const MAX_MESSAGES = parseInt(process.env.MAX_CONTEXT_MESSAGES || '30', 10)

/**
 * Trims the message list to the most recent MAX_CONTEXT_MESSAGES entries.
 * When trimming occurs, prepends a synthetic exchange so Claude knows older
 * messages were omitted and can use getMedicalData/searchChatHistory to recover context.
 */
function buildContextMessages(allMessages) {
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
