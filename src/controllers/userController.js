const User = require("../models/User");
const OnboardingAnswer = require("../models/OnboardingAnswer");
const BloodReport = require("../models/BloodReport");
const ReferralSource = require("../models/ReferralSource");
const axios = require("axios");
const { analyzeBloodReport, prepareAIAnalysisData } = require("../utils/bloodReportAI");
const actionPlanController = require("./actionPlanController");

// ============== ONBOARDING ==============

/**
 * Save onboarding answers
 */
const saveOnboardingAnswers = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { whereYouHeardAboutUs, answers, questionsVersion } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.sendError("User not found", 404);
    }

    // Save onboarding answers
    let onboardingAnswer = await OnboardingAnswer.findOne({ userId });
    if (!onboardingAnswer) {
      onboardingAnswer = new OnboardingAnswer({
        userId,
        answers,
        questionsVersion: questionsVersion || "2.0",
      });
    } else {
      onboardingAnswer.answers = answers;
      if (questionsVersion) onboardingAnswer.questionsVersion = questionsVersion;
    }

    await onboardingAnswer.save();

    // Update user
    user.whereYouHeardAboutUs = whereYouHeardAboutUs;
    user.onboardingAnswers = onboardingAnswer._id;
    user.onboardingCompleted = true;
    await user.save();

    res.sendSuccess(
      { onboardingAnswerId: onboardingAnswer._id },
      "Onboarding completed successfully"
    );
  } catch (error) {
    next(error);
  }
};

// ============== HEAR ABOUT US (REFERRAL) ==============

/**
 * Save "Where did you hear about us" selections
 */
const saveReferralSource = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const {
      socialMediaOrAd,
      wordOfMouth,
      podcast,
      creator,
      webSearch,
      email,
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.sendError("User not found", 404);
    }

    let referral = await ReferralSource.findOne({ userId });
    if (!referral) {
      referral = new ReferralSource({
        userId,
        socialMediaOrAd,
        wordOfMouth,
        podcast,
        creator,
        webSearch,
        email,
      });
    } else {
      referral.socialMediaOrAd = socialMediaOrAd || referral.socialMediaOrAd;
      referral.wordOfMouth = wordOfMouth || referral.wordOfMouth;
      referral.podcast = podcast || referral.podcast;
      referral.creator = creator || referral.creator;
      referral.webSearch = webSearch || referral.webSearch;
      referral.email = email || referral.email;
    }

    await referral.save();

    // Also update the user's whereYouHeardAboutUs field
    // Determine the primary source based on what's provided
    let whereYouHeardAboutUs = "Other";
    if (socialMediaOrAd && Object.keys(socialMediaOrAd).length > 0) {
      whereYouHeardAboutUs = "Social Media";
    } else if (wordOfMouth && Object.keys(wordOfMouth).length > 0) {
      whereYouHeardAboutUs = "Friend Recommendation";
    } else if (webSearch && Object.keys(webSearch).length > 0) {
      whereYouHeardAboutUs = "Search Engine";
    } else if (podcast || creator || email) {
      whereYouHeardAboutUs = "Advertisement";
    }

    user.whereYouHeardAboutUs = whereYouHeardAboutUs;
    await user.save();

    res.sendSuccess({ referralId: referral._id }, "Referral source saved");
  } catch (error) {
    next(error);
  }
};

/**
 * Get "Where did you hear about us" selections
 */
const getReferralSource = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const referral = await ReferralSource.findOne({ userId });
    if (!referral) {
      return res.sendSuccess(null, "No referral source saved yet");
    }
    res.sendSuccess(referral, "Referral source found");
  } catch (error) {
    next(error);
  }
};

/**
 * Get onboarding answers
 */
const getOnboardingAnswers = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).populate("onboardingAnswers");
    if (!user) {
      return res.sendError("User not found", 404);
    }

    res.sendSuccess({
      whereYouHeardAboutUs: user.whereYouHeardAboutUs,
      answers: user.onboardingAnswers?.answers || null,
    });
  } catch (error) {
    next(error);
  }
};

// ============== BLOOD REPORT ==============

/**
 * Upload blood report
 */
const uploadBloodReport = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!req.file) {
      return res.sendError("No file provided", 400);
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.sendError("User not found", 404);
    }

    // Create blood report
    const bloodReport = new BloodReport({
      userId,
      fileName: req.file.originalname,
      filePath: `/uploads/blood-reports/${req.file.filename}`,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });

    await bloodReport.save();

    // Add to user's blood reports
    user.bloodReports.push(bloodReport._id);
    await user.save();

    // Prepare and send data to AI for analysis (async, don't wait)
    // processBloodReportWithAI(userId, bloodReport._id).catch((error) => {
    //   console.error("AI analysis failed:", error.message);
    // });

    res.sendSuccess(
      {
        reportId: bloodReport._id,
        fileName: bloodReport.fileName,
        uploadedAt: bloodReport.uploadedAt,
      },
      "Blood report uploaded successfully",
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Process blood report with AI analysis (background task)
 */
const processBloodReportWithAI = async (userId, bloodReportId) => {
  try {
    console.log(`[AI Analysis] Starting analysis for report ${bloodReportId}`);

    // Prepare all required data
    const analysisData = await prepareAIAnalysisData(userId, bloodReportId);

    console.log(`[AI Analysis] Data prepared:`, {
      questionnaireId: analysisData.questionnaireId,
      userId: analysisData.userId,
      bloodReportId: analysisData.bloodReportId,
      answersCount: Object.keys(analysisData.onboardingAnswers).length,
    });

    // Send to AI for analysis
    const aiResponse = await analyzeBloodReport(analysisData);

    console.log(`[AI Analysis] Analysis completed:`, {
      reportId: aiResponse.reportId,
      confidence: aiResponse.aiMetadata.confidence,
      findingsCount: aiResponse.insights.keyFindings.length,
    });

    // Update blood report with AI analysis
    const bloodReport = await BloodReport.findById(bloodReportId);
    if (bloodReport) {
      bloodReport.actionPlan = JSON.stringify(aiResponse);
      await bloodReport.save();
      console.log(`[AI Analysis] Blood report updated with AI insights`);
    }

    return aiResponse;
  } catch (error) {
    console.error(`[AI Analysis] Error processing report ${bloodReportId}:`, error.message);
    throw error;
  }
};

/**
 * Get blood reports list
 */
const getBloodReports = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).populate("bloodReports");
    if (!user) {
      return res.sendError("User not found", 404);
    }

    res.sendSuccess(user.bloodReports);
  } catch (error) {
    next(error);
  }
};

/**
 * Get single blood report with AI analysis
 */
const getBloodReport = async (req, res, next) => {
  try {
    const { reportId } = req.params;

    const bloodReport = await BloodReport.findById(reportId);
    if (!bloodReport) {
      return res.sendError("Blood report not found", 404);
    }

    // Parse AI analysis if available
    let analysis = null;
    if (bloodReport.actionPlan) {
      try {
        analysis = bloodReport.actionPlan;
      } catch (e) {
        console.error("Failed to parse AI analysis:", e.message);
      }
    }

    res.sendSuccess({
      ...bloodReport.toObject(),
      aiAnalysis: analysis,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete blood report
 */
const deleteBloodReport = async (req, res, next) => {
  try {
    const { reportId, userId } = req.params;

    const bloodReport = await BloodReport.findByIdAndDelete(reportId);
    if (!bloodReport) {
      return res.sendError("Blood report not found", 404);
    }

    // Remove from user's blood reports
    await User.findByIdAndUpdate(userId, {
      $pull: { bloodReports: reportId },
    });

    res.sendSuccess(null, "Blood report deleted successfully");
  } catch (error) {
    next(error);
  }
};

// ============== ACTION PLAN (AI Integration) ==============

/**
 * Generate action plan from blood report
 * Calls AI API
 */
const generateActionPlan = async (req, res, next) => {
  try {
    const { reportId } = req.params;

    // Delegate to central action plan creation flow to ensure consistent behavior,
    // async processing, and proper fallbacks (mock/fallback plan) instead of
    // calling an external AI endpoint synchronously here.
    const fakeReq = {
      body: { reportId },
      user: req.user,
    };

    // Reuse createActionPlan which enqueues processing and returns 202/ready responses
    return actionPlanController.createActionPlan(fakeReq, res, next);
  } catch (error) {
    console.error("Action plan delegation error:", error.message);
    next(error);
  }
};

/**
 * Get action plan for a report
 */
const getActionPlan = async (req, res, next) => {
  try {
    const { reportId } = req.params;

    const bloodReport = await BloodReport.findById(reportId);
    if (!bloodReport) {
      return res.sendError("Blood report not found", 404);
    }

    if (!bloodReport.actionPlan) {
      return res.sendSuccess(
        null,
        "Action plan not yet generated",
        200
      );
    }

    res.sendSuccess({
      reportId,
      actionPlan: bloodReport.actionPlan,
      generatedAt: bloodReport.actionPlanGeneratedAt,
    });
  } catch (error) {
    next(error);
  }
};

// ============== USER PROFILE ==============

/**
 * Get user profile
 */
const getUserProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .populate("onboardingAnswers")
      .populate("bloodReports");

    if (!user) {
      return res.sendError("User not found", 404);
    }

    res.sendSuccess({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      userType: user.userType,
      biologicalSex: user.biologicalSex,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      bio: user.bio,
      profilePicture: user.profilePicture,
      addressLine1: user.addressLine1,
      addressLine2: user.addressLine2,
      city: user.city,
      state: user.state,
      zipCode: user.zipCode,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      onboardingCompleted: user.onboardingCompleted,
      createdAt: user.createdAt,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user profile
 */
const updateUserProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const {
      firstName,
      lastName,
      biologicalSex,
      dateOfBirth,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      phone,
      bio,
    } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          firstName,
          lastName,
          biologicalSex,
          dateOfBirth,
          addressLine1,
          addressLine2,
          city,
          state,
          zipCode,
          phone,
          bio,
        },
      },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.sendError("User not found", 404);
    }

    res.sendSuccess({ user }, "Profile updated successfully");
  } catch (error) {
    next(error);
  }
};

// ============== WELCOME SCREEN ==============

/**
 * Mark welcome screen as seen
 */
const markWelcomeSeen = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { hasSeenWelcome: true },
      { new: true }
    );

    if (!user) {
      return res.sendError("User not found", 404);
    }

    res.sendSuccess({ hasSeenWelcome: true }, "Welcome screen marked as seen");
  } catch (error) {
    next(error);
  }
};

/**
 * Get all users (for doctor dashboard)
 */
const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find({ userType: "user" })
      .select("firstName lastName email phone age registrationDate status")
      .sort({ createdAt: -1 });

    res.sendSuccess(users, "Users retrieved successfully");
  } catch (error) {
    next(error);
  }
};

module.exports = {
  saveOnboardingAnswers,
  getOnboardingAnswers,
  uploadBloodReport,
  getBloodReports,
  getBloodReport,
  deleteBloodReport,
  generateActionPlan,
  getActionPlan,
  getUserProfile,
  updateUserProfile,
  saveReferralSource,
  getReferralSource,
  markWelcomeSeen,
  getAllUsers,
};
