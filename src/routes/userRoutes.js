const express = require("express");
const router = express.Router();
const { rateLimit } = require("express-rate-limit");
const userController = require("../controllers/userController");
const reportController = require("../controllers/reportController");
const { verifyToken, checkRole, checkOwnership } = require("../middlewares/authMiddleware");
const upload = require("../config/multer");

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Upload limit reached. Try again in an hour." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Get all users (for doctor dashboard)
router.get("/", verifyToken, checkRole(["doctor"]), userController.getAllUsers);

// Get user profile
router.get("/:userId/profile", verifyToken, checkOwnership, userController.getUserProfile);

// Update user profile
router.put("/:userId/profile", verifyToken, checkOwnership, userController.updateUserProfile);

// Patient links (or updates) their doctor via referral code, post-signup
router.post("/link-doctor", verifyToken, userController.linkDoctor);

// ============== ONBOARDING ==============
router.post(
  "/:userId/onboarding",
  verifyToken,
  checkOwnership,
  userController.saveOnboardingAnswers
);

router.get(
  "/:userId/onboarding",
  verifyToken,
  checkOwnership,
  userController.getOnboardingAnswers
);

// ============== HEAR ABOUT US (REFERRAL) ==============
router.post(
  "/:userId/hear-about-us",
  verifyToken,
  checkOwnership,
  userController.saveReferralSource
);

router.get(
  "/:userId/hear-about-us",
  verifyToken,
  checkOwnership,
  userController.getReferralSource
);

// ============== WELCOME SCREEN ==============
router.post(
  "/:userId/welcome-seen",
  verifyToken,
  checkOwnership,
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

router.post(
  "/blood-reports/category-summary",
  verifyToken,
  reportController.getCategorySummary
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
  checkOwnership,
  uploadLimiter,
  upload.single("file"),
  reportController.uploadReport
);

router.get(
  "/:userId/blood-reports",
  verifyToken,
  checkOwnership,
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
  checkOwnership,
  reportController.deleteReport
);

module.exports = router;
