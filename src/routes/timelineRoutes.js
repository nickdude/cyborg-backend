const express = require("express");
const router = express.Router();

const { verifyToken, checkRole, checkOwnership } = require("../middlewares/authMiddleware");
const timelineController = require("../controllers/timelineController");

// All routes are user-scoped and require auth.
router.use(verifyToken, checkRole(["user"]));
// Reject requests whose :userId path segment is not the authenticated user.
router.use("/:userId", checkOwnership);

router.get("/:userId/timeline", timelineController.getTimeline);

module.exports = router;
