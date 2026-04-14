const express = require("express");
const router = express.Router();
const agentController = require("../controllers/agentController");

// No auth — server-to-server endpoint
router.post("/parse-report", agentController.parseReport);

module.exports = router;
