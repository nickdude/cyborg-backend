const express = require("express");
const { verifyToken, checkRole } = require("../middlewares/authMiddleware");
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");

const router = express.Router();

// Admin management is gated to privileged roles. "admin" is future-proofing;
// "doctor" is the current privileged role in this app.
const adminOnly = [verifyToken, checkRole(["admin", "doctor"])];

// Public reads (marketplace)
router.get("/", getProducts);
router.get("/:id", getProductById);

// Admin-managed writes
router.post("/", ...adminOnly, createProduct);
router.put("/:id", ...adminOnly, updateProduct);
router.delete("/:id", ...adminOnly, deleteProduct);

module.exports = router;
