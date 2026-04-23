const express = require("express");
const router = express.Router();
const actionPlanController = require("../controllers/actionPlanController");
const { verifyToken } = require("../middlewares/authMiddleware");

router.post("/", verifyToken, actionPlanController.createPlan);
router.get("/latest", verifyToken, actionPlanController.getLatestPlan);
router.get("/:planId", verifyToken, actionPlanController.getPlan);
router.post("/:planId/retry", verifyToken, actionPlanController.retryPlan);
router.get("/:planId/pdf", verifyToken, actionPlanController.exportPlanPDF);

module.exports = router;
