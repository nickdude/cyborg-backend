const express = require("express");
const router = express.Router();

const { verifyToken, checkRole } = require("../middlewares/authMiddleware");
const foodSearchController = require("../controllers/foodSearchController");

// All routes are user-scoped and require auth.
router.use(verifyToken, checkRole(["user"]));

router.get("/:userId/foods/search", foodSearchController.searchFoods);

module.exports = router;
