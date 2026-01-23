const { generateDoctorAIResponse } = require("../utils/doctorAI");

const askDoctorAI = async (req, res) => {
  try {
    const { query, userId } = req.body;

    if (!query || !query.trim()) {
      return res.sendError("Query is required", 400);
    }

    console.log(`[Doctor AI] Processing query for user ${userId}: ${query}`);

    // Generate mock AI response
    const response = await generateDoctorAIResponse(query, userId);

    console.log(`[Doctor AI] Response generated successfully`);

    res.sendSuccess(response);
  } catch (error) {
    console.error("[Doctor AI] Error processing query:", error);
    res.sendError("Failed to process your query. Please try again.", 500);
  }
};

module.exports = {
  askDoctorAI,
};
