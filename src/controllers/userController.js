const User = require("../models/User");
const OnboardingAnswer = require("../models/OnboardingAnswer");
const ReferralSource = require("../models/ReferralSource");

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

    // Update user. Don't touch whereYouHeardAboutUs unless the caller explicitly
    // sent one — it's owned by the dedicated /hear-about-us endpoint, and
    // overwriting with `undefined` here used to wipe a previously-saved value
    // and bounce the user back to the hear-about-us page on next login.
    if (whereYouHeardAboutUs !== undefined) {
      user.whereYouHeardAboutUs = whereYouHeardAboutUs;
    }
    // Map the date-of-birth answer onto the user so downstream scoring (biological
    // age, cyborg score) can use it. The onboarding asks this as question "1.3a".
    const dobAnswer = answers && (answers["1.3a"] || answers.dateOfBirth);
    if (dobAnswer) {
      const dob = new Date(dobAnswer);
      if (!Number.isNaN(dob.getTime()) && dob <= new Date()) {
        user.dateOfBirth = dob;
      }
    }

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
    if (socialMediaOrAd?.platforms?.length > 0 || socialMediaOrAd?.otherText) {
      whereYouHeardAboutUs = "Social Media";
    } else if (wordOfMouth?.sources?.length > 0 || wordOfMouth?.otherText) {
      whereYouHeardAboutUs = "Friend Recommendation";
    } else if (webSearch?.engines?.length > 0 || webSearch?.otherText) {
      whereYouHeardAboutUs = "Search Engine";
    } else if (podcast?.note || creator?.note || email?.sources?.length > 0 || email?.otherText) {
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

// ============== USER PROFILE ==============

/**
 * Get user profile
 */
const getUserProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .populate("onboardingAnswers");

    if (!user) {
      return res.sendError("User not found", 404);
    }

    const profileData = {
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
    };

    profileData.latestReportReady =
      !!user.latestReportReady ||
      (Array.isArray(user.bloodReports) && user.bloodReports.length > 0);
    profileData.bloodReports = user.bloodReports || [];

    // Include doctor-specific fields
    if (user.userType === "doctor") {
      profileData.referralCode = user.referralCode;
    }

    // Include linked doctor for patients
    if (user.userType === "user" && user.linkedDoctor) {
      profileData.linkedDoctor = user.linkedDoctor;
    }

    res.sendSuccess(profileData);
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
  getUserProfile,
  updateUserProfile,
  saveReferralSource,
  getReferralSource,
  markWelcomeSeen,
  getAllUsers,
};
