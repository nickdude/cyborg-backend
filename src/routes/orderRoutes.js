const express = require("express");
const { verifyToken, checkRole } = require("../middlewares/authMiddleware");
const c = require("../controllers/orderController");

const router = express.Router();
router.use(verifyToken);

router.get("/", c.listOrders);
router.get("/:id", c.getOrder);
router.get("/:id/tracking", c.getTracking);
router.post("/:id/cancel", c.cancelOrder);
// Privileged lifecycle update — admin only. Order fulfillment is ops, not
// clinical; a doctor has no business mutating any customer's order status.
router.patch("/:id/status", checkRole(["admin"]), c.updateStatus);

module.exports = router;
