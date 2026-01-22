const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { verifyToken, checkRole } = require("../middlewares/authMiddleware");
const upload = require("../config/multer");

// Get user profile
router.get("/:userId/profile", verifyToken, userController.getUserProfile);

// Update user profile
router.put("/:userId/profile", verifyToken, userController.updateUserProfile);

// ============== ONBOARDING ==============
router.post(
  "/:userId/onboarding",
  verifyToken,
  userController.saveOnboardingAnswers
);

router.get(
  "/:userId/onboarding",
  verifyToken,
  userController.getOnboardingAnswers
);

// ============== HEAR ABOUT US (REFERRAL) ==============
router.post(
  "/:userId/hear-about-us",
  verifyToken,
  userController.saveReferralSource
);

router.get(
  "/:userId/hear-about-us",
  verifyToken,
  userController.getReferralSource
);

// ============== WELCOME SCREEN ==============
router.post(
  "/:userId/welcome-seen",
  verifyToken,
  userController.markWelcomeSeen
);

// ============== BLOOD REPORTS ==============
router.post(
  "/:userId/blood-reports",
  verifyToken,
  checkRole(["user"]),
  upload.single("file"),
  userController.uploadBloodReport
);

router.get(
  "/:userId/blood-reports",
  verifyToken,
  userController.getBloodReports
);

router.get(
  "/blood-reports/:reportId",
  verifyToken,
  userController.getBloodReport
);

router.delete(
  "/:userId/blood-reports/:reportId",
  verifyToken,
  checkRole(["user"]),
  userController.deleteBloodReport
);

// ============== ACTION PLAN ==============
router.post(
  "/blood-reports/:reportId/generate-action-plan",
  verifyToken,
  checkRole(["user"]),
  userController.generateActionPlan
);

router.get(
  "/blood-reports/:reportId/action-plan",
  verifyToken,
  checkRole(["user"]),
  userController.getActionPlan
);

module.exports = router;
