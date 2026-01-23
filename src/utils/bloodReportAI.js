const Questionnaire = require("../models/Questionnaire");
const OnboardingAnswer = require("../models/OnboardingAnswer");
const BloodReport = require("../models/BloodReport");

/**
 * Mock AI Analysis Service
 * Processes blood report data along with user questionnaire and onboarding answers
 */
const analyzeBloodReport = async ({
  questionnaireId,
  userId,
  onboardingAnswers,
  bloodReportId,
}) => {
  // Simulate AI processing time
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Mock AI response based on the provided data
  const analysis = {
    success: true,
    reportId: bloodReportId,
    userId: userId,
    questionnaireId: questionnaireId,
    processedAt: new Date(),
    insights: {
      overview: "Your blood work shows overall good health with a few areas that could benefit from optimization.",
      keyFindings: [
        {
          category: "Metabolic Health",
          status: "good",
          description: "Blood glucose and insulin levels are within optimal range.",
          recommendation: "Maintain current dietary habits and regular exercise routine.",
        },
        {
          category: "Cardiovascular Markers",
          status: "attention",
          description: "LDL cholesterol slightly elevated. HDL levels are good.",
          recommendation: "Consider increasing omega-3 intake and reducing saturated fats.",
        },
        {
          category: "Vitamins & Minerals",
          status: "needs-improvement",
          description: "Vitamin D levels are below optimal range.",
          recommendation: "Supplement with 4000 IU daily and increase sun exposure.",
        },
        {
          category: "Liver Function",
          status: "excellent",
          description: "All liver enzymes within optimal range.",
          recommendation: "Continue current lifestyle habits.",
        },
      ],
      riskFactors: [
        "Based on family history (from questionnaire), monitor cardiovascular health closely",
        "Age-related considerations for bone density - ensure adequate calcium and vitamin D",
      ],
      personalizedRecommendations: [
        {
          title: "Nutrition Adjustments",
          priority: "high",
          actions: [
            "Increase fatty fish consumption to 3x per week",
            "Add 2 servings of leafy greens daily",
            "Consider vitamin D3 supplementation (4000 IU)",
            "Reduce processed foods and added sugars",
          ],
        },
        {
          title: "Lifestyle Modifications",
          priority: "medium",
          actions: [
            "Aim for 30 minutes of sunlight exposure daily",
            "Maintain regular sleep schedule (7-8 hours)",
            "Continue current exercise routine (referenced from onboarding)",
            "Manage stress through meditation or yoga",
          ],
        },
        {
          title: "Follow-up Tests",
          priority: "medium",
          actions: [
            "Recheck vitamin D levels in 3 months",
            "Monitor cholesterol levels in 6 months",
            "Annual comprehensive metabolic panel",
          ],
        },
      ],
    },
    aiMetadata: {
      model: "cyborg-health-ai-v1",
      confidence: 0.89,
      dataPointsAnalyzed: {
        questionnaireAnswers: Object.keys(onboardingAnswers || {}).length,
        bloodMarkers: 25,
      },
    },
  };

  return analysis;
};

/**
 * Fetch all required data for AI analysis
 */
const prepareAIAnalysisData = async (userId, bloodReportId) => {
  try {
    // Get the latest questionnaire
    const questionnaire = await Questionnaire.findOne().sort({ createdAt: -1 });
    if (!questionnaire) {
      throw new Error("Questionnaire not found");
    }

    // Get user's latest onboarding answers
    const onboardingAnswer = await OnboardingAnswer.findOne({ userId }).sort({
      updatedAt: -1,
    });
    if (!onboardingAnswer) {
      throw new Error("Onboarding answers not found for user");
    }

    // Get the blood report
    const bloodReport = await BloodReport.findById(bloodReportId);
    if (!bloodReport) {
      throw new Error("Blood report not found");
    }

    return {
      questionnaireId: questionnaire._id,
      userId: userId,
      onboardingAnswers: onboardingAnswer.answers,
      bloodReportId: bloodReportId,
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  analyzeBloodReport,
  prepareAIAnalysisData,
};
