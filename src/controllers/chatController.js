const { generateChatResponse } = require("../utils/mockAI.js");

const handleChat = async (req, res, next) => {
  try {
    const { message, patientId, patientName } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    // Get AI response using mock AI
    const aiResponse = await generateChatResponse(
      message,
      patientId,
      patientName
    );

    res.status(200).json({
      success: true,
      reply: aiResponse,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process chat message",
      error: error.message,
    });
  }
};

module.exports = { handleChat };
