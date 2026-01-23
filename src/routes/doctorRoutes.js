const express = require("express");
const router = express.Router();
const { askDoctorAI } = require("../controllers/doctorController");
const { verifyToken, checkRole } = require("../middlewares/authMiddleware");

// POST /api/doctor/ask - Ask a question to the Doctor AI (doctors only)
router.post("/ask", verifyToken, checkRole(["doctor"]), askDoctorAI);

module.exports = router;
