const express = require("express");
const router = express.Router();

const { verifyToken, checkRole } = require("../middlewares/authMiddleware");
const glucoseController = require("../controllers/glucoseController");

// All routes are user-scoped and require auth.
router.use(verifyToken, checkRole(["user"]));

router.get("/:userId/glucose/day-review", glucoseController.getDayReview);

router.get("/:userId/glucose/predictions", glucoseController.getPredictions);

module.exports = router;
