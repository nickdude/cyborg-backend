const { getDatabaseSchema } = require("../utils/schemaBuilder");

const definition = {
  name: 'getSchemaInfo',
  description:
    'Retrieve metadata about available MongoDB collections, their fields, types, indexes, and descriptions. Use this to understand what data is available when planning queries or analyzing patient information.',
  input_schema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        enum: ['User', 'Chat', 'Report', 'ReportData', 'all'],
        description:
          'Which collection to get schema for (User, Chat, Report, ReportData, or "all" for complete schema)',
      },
    },
    required: ['collection'],
  },
};

async function execute(input, userId, chatId) {
  try {
    const collection = input.collection?.toLowerCase() || 'all';

    let schemas = await getDatabaseSchema();

    if (collection !== 'all') {
      schemas = schemas.filter((s) => s.collectionName.toLowerCase() === collection);
      if (schemas.length === 0) {
        return {
          error: `Collection '${input.collection}' not found. Available: User, Chat, Report`,
        };
      }
    }

    const summary = schemas.map((s) => ({
      collection: s.collectionName,
      description: s.description,
      documentCount: s.documentCount,
      fields: s.fields.map((f) => ({
        name: f.name,
        type: f.type,
        description: f.description,
        nullable: f.nullable,
      })),
      indexes: s.indexes,
    }));

    return {
      success: true,
      count: summary.length,
      schema: summary,
    };
  } catch (error) {
    return {
      error: `Failed to retrieve schema: ${error.message}`,
    };
  }
}

module.exports = { definition, execute };
