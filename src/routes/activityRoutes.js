const express = require("express");
const router = express.Router();

const { verifyToken, checkRole } = require("../middlewares/authMiddleware");
const activityController = require("../controllers/activityController");

// All routes are user-scoped and require auth.
router.use(verifyToken, checkRole(["user"]));

// Catalog MUST come before /:activityId to avoid "catalog" matching as an ID.
router.get("/:userId/activities/catalog", activityController.getCatalog);

router.post("/:userId/activities", activityController.createActivity);

router.get("/:userId/activities", activityController.listActivities);

router.get("/:userId/activities/:activityId", activityController.getActivityById);

router.patch("/:userId/activities/:activityId", activityController.updateActivity);

router.delete("/:userId/activities/:activityId", activityController.deleteActivity);

module.exports = router;
