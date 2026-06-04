const express = require("express");
const { verifyToken } = require("../middlewares/authMiddleware");
const c = require("../controllers/cartController");

const router = express.Router();
router.use(verifyToken);

router.get("/", c.getCart);
router.post("/items", c.addItem);
router.put("/items/:productId", c.updateItem);
router.delete("/items/:productId", c.removeItem);
router.delete("/", c.clearCart);

module.exports = router;
