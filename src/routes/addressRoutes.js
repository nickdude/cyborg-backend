const express = require("express");
const { verifyToken } = require("../middlewares/authMiddleware");
const c = require("../controllers/addressController");

const router = express.Router();
router.use(verifyToken); // all address routes are user-scoped

router.get("/", c.listAddresses);
router.post("/", c.createAddress);
router.put("/:id", c.updateAddress);
router.patch("/:id/default", c.setDefaultAddress);
router.delete("/:id", c.deleteAddress);

module.exports = router;
