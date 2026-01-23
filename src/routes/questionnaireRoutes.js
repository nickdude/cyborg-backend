const express = require("express");
const { getQuestionnaire, updateQuestionnaire } = require("../controllers/questionnaireController");

const router = express.Router();

// GET - Fetch questionnaire
router.get("/", getQuestionnaire);

// PUT - Update questionnaire
router.put("/", updateQuestionnaire);

module.exports = router;
