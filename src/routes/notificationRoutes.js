const express = require("express");
const router = express.Router();
const { verifyToken, checkRole } = require("../middlewares/authMiddleware");
const notificationController = require("../controllers/notificationController");

router.get(
  "/",
  verifyToken,
  checkRole(["user"]),
  notificationController.listNotifications
);

router.patch(
  "/:id/read",
  verifyToken,
  checkRole(["user"]),
  notificationController.markRead
);

module.exports = router;
