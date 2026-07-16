const express = require("express");
const router = express.Router();

const { verifyToken, checkRole, checkOwnership } = require("../middlewares/authMiddleware");
const foodScoreController = require("../controllers/foodScoreController");

// All routes are user-scoped and require auth.
router.use(verifyToken, checkRole(["user"]));
// Reject requests whose :userId path segment is not the authenticated user.
router.use("/:userId", checkOwnership);

// "scores" must come before ":mealId" to avoid "scores" matching as an ID.
router.get("/:userId/meals/scores", foodScoreController.listScoresByDate);

router.get("/:userId/meals/:mealId/score", foodScoreController.getScore);

router.post(
  "/:userId/meals/:mealId/score/compute",
  foodScoreController.computeScore
);

module.exports = router;
