require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/db");
const seedQuestionnaire = require("../scripts/seedQuestionnaire");
const { buildDatabaseSchema } = require("./utils/schemaBuilder");

// Validate required environment variables
const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[Startup] Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

// Warn about optional but important env vars
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("[Startup] ANTHROPIC_API_KEY not set — AI chat features will fail");
}
if (!process.env.VECTOR_DB_URI) {
  console.warn("[Startup] VECTOR_DB_URI not set — memory/chat summary features will fail");
}
if (!process.env.PERPLEXITY_API_KEY) {
  console.warn("[Startup] PERPLEXITY_API_KEY not set — web search tool will fail");
}

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  seedQuestionnaire();
  buildDatabaseSchema().catch((err) =>
    console.error("[SchemaBuilder] Init failed:", err.message)
  );

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
