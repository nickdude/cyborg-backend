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
  (req, res, next) => {
    mealUpload.array("images", 5)(req, res, (err) => {
      if (!err) return next();
      // Remap multer errors to user-friendly 400s.
      if (err.code === "LIMIT_FILE_COUNT") {
        return res.sendError("Upload up to 5 images per meal.", 400);
      }
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.sendError("Each image must be 10 MB or smaller.", 400);
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.sendError("Use field name 'images' for uploads.", 400);
      }
      // Non-multer errors from our fileFilter already carry statusCode 400 (see mealUpload.js).
      return next(err);
    });
  },
  mealController.analyzeMeal
);

router.post("/:userId/meals", mealController.commitMeal);

router.get("/:userId/meals", mealController.listMeals);

router.get("/:userId/meals/history", mealController.getMealHistory);

router.get("/:userId/meals/summary", mealController.getMealSummary);

router.get("/:userId/meals/:mealId", mealController.getMealById);

router.patch("/:userId/meals/:mealId", mealController.updateMeal);

router.delete("/:userId/meals/:mealId", mealController.deleteMeal);

module.exports = router;
