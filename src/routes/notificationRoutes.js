const express = require("express");
const router = express.Router();
const { verifyToken, checkRole } = require("../middlewares/authMiddleware");
const notificationController = require("../controllers/notificationController");

router.get(
  "/",
  verifyToken,
  checkRole(["user", "doctor"]),
  notificationController.listNotifications
);

router.patch(
  "/:id/read",
  verifyToken,
  checkRole(["user", "doctor"]),
  notificationController.markRead
);

router.patch(
  "/read-all",
  verifyToken,
  checkRole(["user", "doctor"]),
  notificationController.markAllRead
);

module.exports = router;
