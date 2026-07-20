const User = require("../models/User");
const OnboardingAnswer = require("../models/OnboardingAnswer");
const ReferralSource = require("../models/ReferralSource");
const Notification = require("../models/Notification");

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

    // Map biological sex (question "1.3") onto the user so the profile stays in
    // sync with the questionnaire and tools/scoring can read user.biologicalSex
    // directly. Only write a recognized enum value — never garbage.
    const SEX_VALUES = ["Male", "Female", "Other", "Prefer not to say"];
    const sexAnswer = answers && (answers["1.3"] || answers.biologicalSex);
    if (sexAnswer && SEX_VALUES.includes(sexAnswer)) {
      user.biologicalSex = sexAnswer;
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

    // Include linked doctor for patients (name + code so Settings can show it)
    if (user.userType === "user" && user.linkedDoctor) {
      const doc = await User.findById(user.linkedDoctor)
        .select("firstName lastName email referralCode")
        .lean();
      if (doc) {
        profileData.linkedDoctor = {
          id: doc._id,
          name: `${doc.firstName || ""} ${doc.lastName || ""}`.trim() || doc.email,
          code: doc.referralCode || null,
        };
      }
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

    // Keep the onboarding questionnaire in sync with profile edits: write the
    // canonical fields back to the user's existing OnboardingAnswer doc
    // (1.3 = biological sex, 1.3a = date of birth). If they have no onboarding
    // doc yet, skip — getMedicalData already falls back to the profile. Only
    // touch fields the request actually sent. `answers` is a Mixed field whose
    // keys contain dots ("1.3"), so we mutate + markModified rather than $set.
    const SEX_VALUES = ["Male", "Female", "Other", "Prefer not to say"];
    const syncSex = biologicalSex && SEX_VALUES.includes(biologicalSex);
    if (syncSex || dateOfBirth) {
      try {
        const oa = await OnboardingAnswer.findOne({ userId });
        if (oa) {
          oa.answers = oa.answers || {};
          if (syncSex) oa.answers["1.3"] = biologicalSex;
          if (dateOfBirth) oa.answers["1.3a"] = dateOfBirth;
          oa.markModified("answers");
          await oa.save();
        }
      } catch (syncErr) {
        // Sync is best-effort; never fail the profile update because of it.
        console.warn("[updateUserProfile] onboarding sync failed:", syncErr.message);
      }
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
    // A doctor may only list patients LINKED to them (via their DR- referral
    // code → the patient's linkedDoctor). Never return the whole user base —
    // that was a mass cross-patient PII leak to any doctor account.
    const users = await User.find({
      userType: "user",
      linkedDoctor: req.user.id,
      isDeleted: { $ne: true },
    })
      .select("firstName lastName email phone age registrationDate status")
      .sort({ createdAt: -1 });

    res.sendSuccess(users, "Users retrieved successfully");
  } catch (error) {
    next(error);
  }
};

/**
 * Patient links (or updates) their doctor via a referral code, post-signup from
 * Settings. An empty code unlinks. Mirrors the registration-time linking and
 * notifies the doctor so the patient shows up on their dashboard immediately.
 */
const linkDoctor = async (req, res, next) => {
  try {
    if (req.user.userType === "doctor") {
      return res.sendError("Doctors cannot link to a doctor", 400);
    }
    const raw = String(req.body?.referralCode || "").trim();
    const user = await User.findById(req.user.id);
    if (!user) return res.sendError("User not found", 404);

    // Empty code clears the link.
    if (!raw) {
      user.linkedDoctor = null;
      await user.save();
      return res.sendSuccess({ linkedDoctor: null }, "Doctor removed");
    }

    const code = raw.toUpperCase();
    const doctor = await User.findOne({ referralCode: code, userType: "doctor" });
    if (!doctor) return res.sendError("No doctor found with that code", 404);

    user.linkedDoctor = doctor._id;
    await user.save();

    // Notify the doctor that a patient linked via their code.
    try {
      await Notification.create({
        userId: doctor._id,
        type: "patient:linked",
        metadata: {
          patientId: user._id,
          patientEmail: user.email || user.phone,
          patientName: user.firstName || user.email || user.phone,
        },
      });
    } catch (_) {
      /* notification is best-effort */
    }

    return res.sendSuccess(
      {
        linkedDoctor: {
          id: doctor._id,
          name: `${doctor.firstName || ""} ${doctor.lastName || ""}`.trim() || doctor.email,
          code,
        },
      },
      "Doctor linked successfully"
    );
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
  linkDoctor,
};
