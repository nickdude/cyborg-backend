const mongoose = require("mongoose");

const schemaInfoSchema = new mongoose.Schema(
  {
    collectionName: { type: String, required: true, unique: true },
    description: String,
    fields: [mongoose.Schema.Types.Mixed],
    indexes: [String],
    sampleCount: Number,
    lastUpdated: { type: Date, default: Date.now },
  },
  { collection: 'schema_info' }
);

const SchemaInfo = mongoose.model('SchemaInfo', schemaInfoSchema);

module.exports = SchemaInfo;
