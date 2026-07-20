const express = require("express");
const router = express.Router();

const { verifyToken, checkRole, checkOwnership } = require("../middlewares/authMiddleware");
const foodSearchController = require("../controllers/foodSearchController");

// All routes are user-scoped and require auth.
router.use(verifyToken, checkRole(["user"]));
// Reject requests whose :userId path segment is not the authenticated user.
router.use("/:userId", checkOwnership);

router.get("/:userId/foods/search", foodSearchController.searchFoods);

// Deterministic single-item insight: engine score + GI match + community
// stats (no persistence, no AI).
router.post("/:userId/foods/insight", foodSearchController.itemInsight);

module.exports = router;
