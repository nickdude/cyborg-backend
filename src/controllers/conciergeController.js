const { generateMockAIResponse } = require("../utils/conciergeAI");

const askConcierge = async (req, res) => {
  try {
    const { query, userId } = req.body;

    if (!query || !query.trim()) {
      return res.sendError("Query is required", 400);
    }

    console.log(`[Concierge] Processing query for user ${userId}: ${query}`);

    // Generate mock AI response
    const response = await generateMockAIResponse(query, userId);

    console.log(`[Concierge] Response generated successfully`);

    res.sendSuccess(response);
  } catch (error) {
    console.error("[Concierge] Error processing query:", error);
    res.sendError("Failed to process your query. Please try again.", 500);
  }
};

module.exports = {
  askConcierge,
};
