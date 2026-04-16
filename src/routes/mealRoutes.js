const express = require("express");
const router = express.Router();

const { verifyToken, checkRole } = require("../middlewares/authMiddleware");
const mealUpload = require("../config/mealUpload");
const mealController = require("../controllers/mealController");

// All routes are user-scoped and require auth.
router.use(verifyToken, checkRole(["user"]));

// Multipart: up to 5 images as field name "images" + optional "description"
router.post(
  "/:userId/meals/analyze",
  mealUpload.array("images", 5),
  mealController.analyzeMeal
);

router.post("/:userId/meals", mealController.commitMeal);

router.get("/:userId/meals", mealController.listMeals);

router.get("/:userId/meals/summary", mealController.getMealSummary);

router.patch("/:userId/meals/:mealId", mealController.updateMeal);

router.delete("/:userId/meals/:mealId", mealController.deleteMeal);

module.exports = router;
