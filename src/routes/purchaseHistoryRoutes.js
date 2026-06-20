const express = require("express");
const { verifyToken } = require("../middlewares/authMiddleware");
const c = require("../controllers/purchaseHistoryController");

const router = express.Router();
router.use(verifyToken);

router.get("/", c.getPurchaseHistory);

module.exports = router;
