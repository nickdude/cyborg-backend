const express = require("express");
const router = express.Router();

const { verifyToken, checkRole, checkOwnership } = require("../middlewares/authMiddleware");
const foodSearchController = require("../controllers/foodSearchController");

// All routes are user-scoped and require auth.
router.use(verifyToken, checkRole(["user"]));
// Reject requests whose :userId path segment is not the authenticated user.
router.use("/:userId", checkOwnership);

router.get("/:userId/foods/search", foodSearchController.searchFoods);

module.exports = router;
