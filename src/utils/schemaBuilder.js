const User = require("../models/User")
const Chat = require("../models/Chat")
const ReportData = require("../models/ReportData")
const SchemaInfo = require("../models/SchemaInfo")

// Fields that must never appear in schema metadata returned to the agent
const SENSITIVE_FIELDS = new Set(['password', 'passwordHash', 'passwordSalt', 'token', 'secret'])

const COLLECTION_DESCRIPTIONS = {
  User: 'Stores user account info and onboarding data. Each user has health preferences, conditions, and medications.',
  Chat: 'Stores conversation history. Each chat has role (user/assistant), content, tool calls, and thinking tokens.',
  ReportData: 'Stores parsed medical reports from the vision-based PDF parser agent. Contains structured JSON with patient info, lab tests, diagnoses, panels, and metadata.',
}

function mongooseTypeToString(pathType) {
  if (!pathType) return 'unknown'
  const name = pathType.instance || (pathType.name ?? '')
  const map = {
    String: 'string',
    Number: 'number',
    Boolean: 'boolean',
    Date: 'date',
    ObjectID: 'ObjectId',
    ObjectId: 'ObjectId',
    Array: 'array',
    Mixed: 'object',
    Map: 'map',
    Buffer: 'buffer',
  }
  return map[name] || name.toLowerCase() || 'unknown'
}

function getFieldDescription(collection, field) {
  const descriptions = {
    User: {
      _id: 'Unique user identifier (MongoDB ObjectId)',
      email: 'User email address (indexed)',
      onboardingCompleted: 'Boolean — true once user finishes health questionnaire',
      onboardingData: 'Health questionnaire: conditions, symptoms, medications, diet, lifestyle, goals',
      createdAt: 'Account creation timestamp',
      updatedAt: 'Last update timestamp',
    },
    Chat: {
      _id: 'Chat session identifier',
      userId: 'Reference to User._id',
      title: 'Chat session title/topic',
      messages: 'Array of {role, content, toolUses, thinking} message objects',
      createdAt: 'Chat creation timestamp',
      updatedAt: 'Last message timestamp',
    },
    ReportData: {
          _id: 'Report data identifier',
          userId: 'Reference to User._id',
          sourceUrl: 'Original file URL (S3 or local path)',
          filename: 'Original filename',
          parsedData: 'Full structured JSON: patient, tests, panels, diagnoses, signatures',
          modelUsed: 'Claude model used for parsing',
          tokensUsed: 'Token usage stats {input, output}',
          createdAt: 'Parse timestamp',
      },
  }
  return descriptions[collection]?.[field] || ''
}

function extractSchemaFields(model, collectionName) {
  const schemaPaths = model.schema.paths
  const fields = []

  for (const [pathName, pathDef] of Object.entries(schemaPaths)) {
    // Skip internal Mongoose meta paths and sensitive fields
    if (pathName === '__v') continue
    if (SENSITIVE_FIELDS.has(pathName)) continue

    // Flatten nested paths like 'messages.0.role' — only keep top-level
    const topLevel = pathName.split('.')[0]
    if (pathName !== topLevel && !pathName.match(/^[^.]+$/)) continue

    fields.push({
      name: pathName,
      type: mongooseTypeToString(pathDef),
      nullable: !pathDef.isRequired,
      description: getFieldDescription(collectionName, pathName),
    })
  }

  return fields
}

async function analyzeCollection(model, collectionName) {
  const totalCount = await model.countDocuments()
  const fields = extractSchemaFields(model, collectionName)

  const rawIndexes = await model.collection.indexes()
  const indexNames = rawIndexes
    .filter((idx) => idx.name !== '_id_')
    .map((idx) => {
      const keys = Object.keys(idx.key)
      return keys.length === 1 ? keys[0] : `(${keys.join(', ')})`
    })

  return {
    collectionName,
    description: COLLECTION_DESCRIPTIONS[collectionName] || '',
    fields,
    indexes: indexNames,
    documentCount: totalCount,
  }
}

async function buildDatabaseSchema() {
  const models = [
    { model: User, name: 'User' },
    { model: Chat, name: 'Chat' },
    { model: ReportData, name: 'ReportData' },
  ]

  const schemas = []
  for (const { model, name } of models) {
    try {
      const schema = await analyzeCollection(model, name)
      schemas.push(schema)
      await SchemaInfo.updateOne(
        { collectionName: name },
        { $set: { ...schema, lastUpdated: new Date() } },
        { upsert: true }
      )
    } catch (error) {
      console.error(`[SchemaBuilder] Failed to analyze ${name}:`, error.message)
    }
  }

  console.log(`[SchemaBuilder] Updated schema for ${schemas.length} collections`)
  return schemas
}

async function getDatabaseSchema() {
  return SchemaInfo.find().sort({ collectionName: 1 }).lean()
}

module.exports = { buildDatabaseSchema, getDatabaseSchema };
