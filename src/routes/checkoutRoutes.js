const express = require("express");
const { verifyToken } = require("../middlewares/authMiddleware");
const c = require("../controllers/checkoutController");

const router = express.Router();
router.use(verifyToken);

router.post("/", c.createCheckout);
router.post("/verify", c.verifyPayment);
router.post("/:orderId/retry", c.retryPayment);

module.exports = router;
