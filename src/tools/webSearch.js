const { querySonar } = require("../services/perplexity");

const definition = {
  name: 'webSearch',
  description: 'Search the web for general health information, current news, drug interactions, product info, or anything outside your training data. Returns an answer with clickable source citations.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
    },
    required: ['query'],
  },
};

async function execute(input, userId, chatId) {
  return querySonar({
    model: 'sonar',
    query: input.query,
    systemPrompt: 'You are a web search assistant. Provide a clear, concise answer with relevant facts.',
    searchContextSize: 'medium',
  });
}

module.exports = { definition, execute };
