require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/db");
const seedQuestionnaire = require("../scripts/seedQuestionnaire");
const { buildDatabaseSchema } = require("./utils/schemaBuilder");

connectDB().then(() => {
  seedQuestionnaire();
  buildDatabaseSchema().catch((err) =>
    console.error("[SchemaBuilder] Init failed:", err.message)
  );
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
