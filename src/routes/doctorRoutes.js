const express = require("express");
const router = express.Router();
const doctorController = require("../controllers/doctorController");
const { verifyToken, checkRole } = require("../middlewares/authMiddleware");

// Patient listing
router.get("/patients", verifyToken, checkRole(["doctor"]), doctorController.listPatients);
router.get("/patients/:patientId", verifyToken, checkRole(["doctor"]), doctorController.getPatient);

// Doctor chat CRUD
router.get("/chats", verifyToken, checkRole(["doctor"]), doctorController.listDoctorChats);
router.post("/chats", verifyToken, checkRole(["doctor"]), doctorController.createDoctorChat);
router.get("/chats/:id", verifyToken, checkRole(["doctor"]), doctorController.getDoctorChat);
router.post("/chats/:id/messages", verifyToken, checkRole(["doctor"]), doctorController.sendDoctorMessage);
router.patch("/chats/:id", verifyToken, checkRole(["doctor"]), doctorController.updateDoctorChat);
router.delete("/chats/:id", verifyToken, checkRole(["doctor"]), doctorController.deleteDoctorChat);

module.exports = router;
