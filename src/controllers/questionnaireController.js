const Questionnaire = require("../models/Questionnaire");

/**
 * Get Questionnaire
 * Fetches the questionnaire data
 */
const getQuestionnaire = async (req, res, next) => {
  try {
    let questionnaire = await Questionnaire.findOne();

    if (!questionnaire) {
      return res.sendError(404, "Questionnaire not found");
    }

    res.sendSuccess(questionnaire, "Questionnaire fetched successfully");
  } catch (error) {
    next(error);
  }
};

/**
 * Update Questionnaire
 * Updates the questionnaire data
 */
const updateQuestionnaire = async (req, res, next) => {
  try {
    const { questionary } = req.body;

    if (!questionary) {
      return res.sendError(400, "Questionary data is required");
    }

    let questionnaire = await Questionnaire.findOne();

    if (!questionnaire) {
      // Create if doesn't exist
      questionnaire = new Questionnaire({ questionary });
    } else {
      // Update existing
      questionnaire.questionary = questionary;
    }

    await questionnaire.save();

    res.sendSuccess(questionnaire, "Questionnaire updated successfully");
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getQuestionnaire,
  updateQuestionnaire,
};
