const express = require("express");
const router = express.Router();
const { verifyToken, checkRole } = require("../middlewares/authMiddleware");
const actionPlanController = require("../controllers/actionPlanController");

// Create (enqueue) action plan generation
router.post(
  "/",
  verifyToken,
  checkRole(["user"]),
  actionPlanController.createActionPlan
);

// Get action plan (status + data)
router.get(
  "/:id",
  verifyToken,
  checkRole(["user"]),
  actionPlanController.getActionPlan
);

// Retry a failed action plan
router.post(
  "/:id/retry",
  verifyToken,
  checkRole(["user"]),
  actionPlanController.retryActionPlan
);

// Export action plan as PDF
router.get(
  "/:id/pdf",
  verifyToken,
  checkRole(["user"]),
  actionPlanController.exportPDF
);

module.exports = router;
