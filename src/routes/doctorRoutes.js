const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const router = express.Router();
const doctorController = require("../controllers/doctorController");
const { verifyToken, checkRole } = require("../middlewares/authMiddleware");

// Per-user rate limit on the expensive doctor SSE message endpoint.
// Mirrors the patient chat limiter (chatRoutes.js): keyed by the authenticated
// user id (set by verifyToken), falling back to the library's IPv6-safe
// ipKeyGenerator so users behind shared NATs aren't throttled together and
// IPv6 addresses can't bypass the limit.
const sendMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.CHAT_RATE_LIMIT_PER_MINUTE || "15", 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req),
  handler: (req, res) => {
    res.sendError("Too many messages. Please slow down.", 429);
  },
});

// Patient listing
router.get("/patients", verifyToken, checkRole(["doctor"]), doctorController.listPatients);
router.get("/patients/:patientId", verifyToken, checkRole(["doctor"]), doctorController.getPatient);

// Action Plan & Goal management for linked patients
router.get("/patients/:patientId/action-plan", verifyToken, checkRole(["doctor"]), doctorController.getPatientActionPlan);
router.put("/patients/:patientId/goals", verifyToken, checkRole(["doctor"]), doctorController.updatePatientGoals);
router.post("/patients/:patientId/goals", verifyToken, checkRole(["doctor"]), doctorController.addGoal);
router.delete("/patients/:patientId/goals/:goalId", verifyToken, checkRole(["doctor"]), doctorController.deleteGoal);
router.post("/patients/:patientId/action-plan/approve", verifyToken, checkRole(["doctor"]), doctorController.approveActionPlan);

// Doctor chat CRUD
router.get("/chats", verifyToken, checkRole(["doctor"]), doctorController.listDoctorChats);
router.post("/chats", verifyToken, checkRole(["doctor"]), doctorController.createDoctorChat);
router.get("/chats/:id", verifyToken, checkRole(["doctor"]), doctorController.getDoctorChat);
router.post("/chats/:id/messages", verifyToken, checkRole(["doctor"]), sendMessageLimiter, doctorController.sendDoctorMessage);
router.patch("/chats/:id", verifyToken, checkRole(["doctor"]), doctorController.updateDoctorChat);
router.delete("/chats/:id", verifyToken, checkRole(["doctor"]), doctorController.deleteDoctorChat);

module.exports = router;
