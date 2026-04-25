const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const reportController = require("../controllers/reportController");
const { verifyToken, checkRole } = require("../middlewares/authMiddleware");
const upload = require("../config/multer");

// Get all users (for doctor dashboard)
router.get("/", verifyToken, checkRole(["doctor"]), userController.getAllUsers);

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

// ============== BLOOD REPORTS (ReportData + Vision Parsing) ==============
// Specific routes BEFORE :reportId param route to avoid matching "biomarkers" etc. as an ID
router.get(
  "/blood-reports/biomarkers",
  verifyToken,
  reportController.getBiomarkers
);

router.get(
  "/blood-reports/biomarker-panel",
  verifyToken,
  reportController.getBiomarkerPanel
);

router.get(
  "/blood-reports/timeline/:canonicalName",
  verifyToken,
  reportController.getBiomarkerTimeline
);

router.get(
  "/blood-reports/trends",
  verifyToken,
  reportController.getBiomarkerTrends
);

// Param-based routes after the specific ones
router.post(
  "/:userId/blood-reports",
  verifyToken,
  checkRole(["user"]),
  upload.single("file"),
  reportController.uploadReport
);

router.get(
  "/:userId/blood-reports",
  verifyToken,
  reportController.listReports
);

router.get(
  "/blood-reports/:reportId",
  verifyToken,
  reportController.getReport
);

router.get(
  "/blood-reports/:reportId/file",
  verifyToken,
  reportController.getReportFile
);

router.patch(
  "/blood-reports/:reportId",
  verifyToken,
  reportController.updateReport
);

router.delete(
  "/:userId/blood-reports/:reportId",
  verifyToken,
  checkRole(["user"]),
  reportController.deleteReport
);

module.exports = router;
