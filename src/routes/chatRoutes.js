const express = require("express");
const { handleChat } = require("../controllers/chatController.js");

const router = express.Router();

// POST /api/chat - Handle chat messages (mock API, no auth required for now)
router.post("/", handleChat);

module.exports = router;
