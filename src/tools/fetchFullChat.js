const Chat = require("../models/Chat");

const definition = {
  name: 'fetchFullChat',
  description: 'Fetch the complete message history of a past conversation. Call this after searchChatHistory returns a highly relevant result and you need the full details. Only call if the summary alone is not sufficient.',
  input_schema: {
    type: 'object',
    properties: {
      chatId: {
        type: 'string',
        description: 'The chatId returned from searchChatHistory.',
      },
    },
    required: ['chatId'],
  },
};

async function execute(input, userId, chatId) {
  const { chatId: targetChatId } = input;

  const chat = await Chat.findOne({ _id: targetChatId, userId })
    .select('title messages createdAt updatedAt')
    .lean();

  if (!chat) {
    return { error: 'Chat not found or does not belong to this user.' };
  }

  return {
    title: chat.title,
    date: chat.updatedAt,
    messageCount: chat.messages.length,
    messages: chat.messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  };
}

module.exports = { definition, execute };
