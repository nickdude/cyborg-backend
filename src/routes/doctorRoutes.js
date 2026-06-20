const express = require("express");
const router = express.Router();
const doctorController = require("../controllers/doctorController");
const { verifyToken, checkRole } = require("../middlewares/authMiddleware");

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
router.post("/chats/:id/messages", verifyToken, checkRole(["doctor"]), doctorController.sendDoctorMessage);
router.patch("/chats/:id", verifyToken, checkRole(["doctor"]), doctorController.updateDoctorChat);
router.delete("/chats/:id", verifyToken, checkRole(["doctor"]), doctorController.deleteDoctorChat);

module.exports = router;
