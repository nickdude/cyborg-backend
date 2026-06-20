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

// Diagnostics for the blood-report upload path. `content-length` is the key
// signal: large mobile camera photos can be dropped at the network edge
// (e.g. AWS API Gateway's 10MB limit or nginx client_max_body_size) BEFORE the
// request reaches Express, which the browser then reports as a generic
// "Network Error". If a failed upload shows NO [UPLOAD-REQ] line, the edge
// rejected it before Node ever saw it.
const logUploadRequest = (req, res, next) => {
  console.log(
    "[UPLOAD-REQ]",
    JSON.stringify({
      method: req.method,
      url: req.originalUrl,
      contentLength: req.headers["content-length"],
      contentType: req.headers["content-type"],
      origin: req.headers["origin"],
      host: req.headers["host"],
      xff: req.headers["x-forwarded-for"],
      ua: req.headers["user-agent"],
      at: new Date().toISOString(),
    })
  );
  next();
};

// Wrap multer so its errors (LIMIT_FILE_SIZE, rejected type, etc.) are logged
// explicitly instead of surfacing as an opaque failure.
const uploadSingle = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      console.error(
        "[MULTER-ERR]",
        JSON.stringify({
          name: err.name,
          code: err.code, // e.g. LIMIT_FILE_SIZE
          message: err.message,
          field: err.field,
          contentLength: req.headers["content-length"],
          ua: req.headers["user-agent"],
        })
      );
      return next(err);
    }
    if (req.file) {
      console.log(
        "[MULTER] file accepted",
        JSON.stringify({
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          sizeKB: Math.round(req.file.size / 1024),
        })
      );
    }
    next();
  });
};

// Get all users (for doctor dashboard)
router.get("/", verifyToken, checkRole(["doctor"]), userController.getAllUsers);

// Get user profile
router.get("/:userId/profile", verifyToken, checkOwnership, userController.getUserProfile);

// Update user profile
router.put("/:userId/profile", verifyToken, checkOwnership, userController.updateUserProfile);

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
  logUploadRequest,
  verifyToken,
  checkRole(["user"]),
  checkOwnership,
  uploadLimiter,
  uploadSingle,
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
