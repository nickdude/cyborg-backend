const express = require("express");
const { verifyToken, checkRole } = require("../middlewares/authMiddleware");
const { getQuestionnaire, updateQuestionnaire } = require("../controllers/questionnaireController");

const router = express.Router();

// GET - Fetch questionnaire (public: the onboarding form needs it pre-login)
router.get("/", getQuestionnaire);

// PUT - Update the global questionnaire. Previously unauthenticated, letting any
// anonymous caller overwrite onboarding for every user. Restricted to an
// authenticated privileged (doctor) account; no app UI calls this.
router.put("/", verifyToken, checkRole(["doctor"]), updateQuestionnaire);

module.exports = router;
