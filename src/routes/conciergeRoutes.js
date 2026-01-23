const express = require("express");
const router = express.Router();
const { askConcierge } = require("../controllers/conciergeController");
const { verifyToken } = require("../middlewares/authMiddleware");

// POST /api/concierge/ask - Ask a question to the AI
router.post("/ask", verifyToken, askConcierge);

module.exports = router;
