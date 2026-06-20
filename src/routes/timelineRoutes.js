const express = require("express");
const router = express.Router();

const { verifyToken, checkRole } = require("../middlewares/authMiddleware");
const timelineController = require("../controllers/timelineController");

// All routes are user-scoped and require auth.
router.use(verifyToken, checkRole(["user"]));

router.get("/:userId/timeline", timelineController.getTimeline);

module.exports = router;
