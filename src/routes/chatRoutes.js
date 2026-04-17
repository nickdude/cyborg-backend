const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const chatController = require("../controllers/chatController");
const { verifyToken } = require("../middlewares/authMiddleware");

// Per-user rate limit on the expensive SSE endpoint.
// Keyed by authenticated user id (set by verifyToken), not IP,
// so users behind shared NATs aren't throttled together.
const sendMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.CHAT_RATE_LIMIT_PER_MINUTE || "15", 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    res.sendError("Too many messages. Please slow down.", 429);
  },
});

router.get("/", verifyToken, chatController.listChats);
router.post("/", verifyToken, chatController.createChat);
router.get("/:id", verifyToken, chatController.getChat);
router.post("/:id/messages", verifyToken, sendMessageLimiter, chatController.sendMessage);
router.patch("/:id", verifyToken, chatController.updateChat);
router.delete("/:id", verifyToken, chatController.deleteChat);

module.exports = router;
