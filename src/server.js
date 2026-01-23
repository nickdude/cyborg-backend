require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/db");
const seedQuestionnaire = require("../scripts/seedQuestionnaire");

connectDB().then(() => {
  seedQuestionnaire();
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
