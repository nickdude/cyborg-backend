const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const { verifyToken } = require("../middlewares/authMiddleware");

router.get("/", verifyToken, chatController.listChats);
router.post("/", verifyToken, chatController.createChat);
router.get("/:id", verifyToken, chatController.getChat);
router.post("/:id/messages", verifyToken, chatController.sendMessage);
router.patch("/:id", verifyToken, chatController.updateChat);
router.delete("/:id", verifyToken, chatController.deleteChat);

module.exports = router;
