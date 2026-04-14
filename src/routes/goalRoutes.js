const express = require("express");
const router = express.Router();
const goalController = require("../controllers/goalController");
const { verifyToken } = require("../middlewares/authMiddleware");

router.get("/", verifyToken, goalController.listGoals);
router.get("/:goalId", verifyToken, goalController.getGoal);

module.exports = router;
